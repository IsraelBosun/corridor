import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MAPBOX_READY, TILE, tileUrl, type LngLat } from '@/lib/mapbox';
import { currentScheme, elevation, LIME, NIGHT, PINE, radius, space, themed } from '@/theme/tokens';
import { FrameIcon, LocateIcon } from './icons';
import { Text } from './text';

/**
 * A slippy map with no map SDK under it.
 *
 * Native map SDKs need a development build, and this app runs in Expo Go, so
 * the map is Mapbox raster tiles drawn as images with the route as views on top.
 * What makes it feel like a real map rather than a picture of one:
 *
 * - The camera lives on the UI thread. Pan, pinch, fling and double tap move
 *   shared values and never wait on React. React only catches up every ninety
 *   milliseconds to swap in the tiles that have come into view.
 * - Zoom is continuous. Tiles come from the nearest whole zoom level and are
 *   scaled to the exact one, so a pinch never snaps.
 * - Tiles and route are laid out in fixed layer pixels, not relative to the
 *   camera, and one transform on the UI thread places the whole layer. A
 *   re-render adds and removes tiles at the edges and never moves the ones on
 *   screen, which is what stops the map shuddering while it is dragged.
 * - Every gesture ends with a commit of exactly where the camera stopped, so
 *   the last frame drawn is always the right one.
 * - Markers sit in their own layer and are placed per frame, so they stay the
 *   same size while the map zooms under them.
 *
 * A tap can pick a marker that asks for it (a ride's pickup, say), but it
 * still never takes a tap to place a point. Moving the map records
 * nothing: a map that accepts a pin becomes a way to store where somebody
 * lives, and rule 2 exists to stop exactly that.
 */

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  /**
   * start: the pickup. end: the far end of a route. stop: a stop on the way.
   * drop: where you get off. rider: a rider's drop off, shown to their driver.
   * ride: the pickup of a ride on the list that is not the one picked out.
   * car: where the driver is right now, shown to riders on the ride.
   * person: where a waiting rider is right now, shown to their driver.
   */
  kind: 'start' | 'end' | 'stop' | 'drop' | 'rider' | 'ride' | 'car' | 'person';
  label?: string;
  /** For a rider's drop off: their place in the drop off order, from 1. */
  num?: number;
  /** For a person: their initials. */
  initials?: string;
  /** Set to make the marker tappable: what onMarkerPress is told was tapped. */
  tap?: string;
};

export type MapRoute = {
  id: string;
  points: LngLat[];
  /** primary is the route this screen is about. muted is everything else. */
  tone: 'primary' | 'muted';
};

export type Padding = { top: number; bottom: number; left: number; right: number };

const MIN_Z = 8;
const MAX_Z = 18;
/** Tile levels Mapbox serves for this style. */
const MAX_TILE_Z = 18;
/** Extra ring of tiles beyond the frame, so a drag has something to reveal. */
const MARGIN = 1;

const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };

/** How close to a marker a tap must land, in screen points. A fingertip, not a dot. */
const HIT = 26;

/**
 * The zoom the outer layer's transform is expressed in. Fixed, so placing the
 * layer depends on the live camera alone.
 *
 * Tiles and route are not laid out at this zoom. They are laid out at the tile
 * level being drawn, where a tile is 256 points, inside a sub-layer scaled by
 * 2^(Z0 - level). An earlier version laid everything out at zoom 18 and shrank
 * it about 128 times: at the corridor's zoom that made every tile and route
 * segment a view tens of thousands of pixels across, and Android drew none of
 * them. Every view is now close to its size on screen.
 */
const Z0 = 14;

/**
 * Layer pixels are measured from here, the middle of the corridor, so the
 * numbers the layout engine sees stay small. Fixed, so moving the camera never
 * moves the origin under the tiles.
 */
const ANCHOR = toUnit(6.45, 3.5);

/** Normalised Web Mercator: the whole world is the unit square. */
function toUnit(lat: number, lng: number): { x: number; y: number } {
  const rad = (lat * Math.PI) / 180;
  return {
    x: (lng + 180) / 360,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

type Camera = { cx: number; cy: number; z: number };

type Pt = { x: number; y: number };

/**
 * Douglas-Peucker. A driving route comes back with a point every few metres,
 * far more than a zoom level can show, and every point kept is a view drawn.
 */
function simplify(pts: Pt[], tolerance: number): Pt[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const ax = pts[a].x;
    const ay = pts[a].y;
    const dx = pts[b].x - ax;
    const dy = pts[b].y - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = tol2;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i].x - ax;
      const py = pts[i].y - ay;
      let d: number;
      if (len2 === 0) {
        d = px * px + py * py;
      } else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - t * dx;
        const ey = py - t * dy;
        d = ex * ex + ey * ey;
      }
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

/** The camera that frames these points inside the padded part of the frame. */
function fitCamera(points: LngLat[], w: number, h: number, pad: Padding): Camera | null {
  if (points.length === 0 || w <= 0 || h <= 0) return null;
  const us = points.map((p) => toUnit(p.lat, p.lng));
  const minX = Math.min(...us.map((u) => u.x));
  const maxX = Math.max(...us.map((u) => u.x));
  const minY = Math.min(...us.map((u) => u.y));
  const maxY = Math.max(...us.map((u) => u.y));

  const aw = Math.max(40, w - pad.left - pad.right);
  const ah = Math.max(40, h - pad.top - pad.bottom);
  const spanX = Math.max(maxX - minX, 1e-7);
  const spanY = Math.max(maxY - minY, 1e-7);

  // One point, or points on top of each other, frame at street level rather
  // than at the maximum zoom the arithmetic would ask for.
  const raw = Math.log2(Math.min(aw / (spanX * TILE), ah / (spanY * TILE)));
  const z = clamp(points.length === 1 ? 15 : Math.min(raw, 16), MIN_Z, MAX_Z);

  const world = TILE * 2 ** z;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  // The middle of the points lands in the middle of the padded area, not of
  // the whole frame, so a sheet over the bottom half never covers the route.
  const offX = pad.left + aw / 2 - w / 2;
  const offY = pad.top + ah / 2 - h / 2;
  return { cx: midX - offX / world, cy: midY - offY / world, z };
}

/** What React has drawn: the camera it drew for, and the tile level it used. */
type Drawn = Camera & { lz: number };

export function MapView({
  routes = [],
  markers = [],
  fit,
  padding = NO_PADDING,
  showFrameButton = true,
  controlsBottom = space.md,
  me,
  onMarkerPress,
}: {
  routes?: MapRoute[];
  markers?: MapMarker[];
  /** The points the camera frames on first show, and again on the frame button. */
  fit: LngLat[];
  /** Space covered by things floating over the map, such as a bottom sheet. */
  padding?: Padding;
  showFrameButton?: boolean;
  /** How far up from the map's bottom edge the frame button sits, to clear a sheet. */
  controlsBottom?: number;
  /** This phone's position, drawn as a live dot. Never part of the framing. */
  me?: LngLat | null;
  /**
   * A tap on tappable markers: every tap value under the finger, nearest
   * first, since pickups at the same office sit on top of each other.
   */
  onMarkerPress?: (taps: string[]) => void;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [moved, setMoved] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  // The live camera, on the UI thread.
  const cx = useSharedValue(0.5);
  const cy = useSharedValue(0.5);
  const z = useSharedValue(10);
  const fw = useSharedValue(0);
  const fh = useSharedValue(0);
  const lastCommit = useSharedValue(0);

  /** Bring React up to date with the camera, and pick the tile level for it. */
  const commit = useCallback((ncx: number, ncy: number, nz: number) => {
    setDrawn({ cx: ncx, cy: ncy, z: nz, lz: Math.round(clamp(nz, MIN_Z, MAX_TILE_Z)) });
  }, []);

  // Any camera movement, from any source, is committed at most every 90 ms.
  useAnimatedReaction(
    () => [cx.value, cy.value, z.value],
    (cur, prev) => {
      if (!prev) return;
      if (cur[0] === prev[0] && cur[1] === prev[1] && cur[2] === prev[2]) return;
      const now = Date.now();
      if (now - lastCommit.value < 90) return;
      lastCommit.value = now;
      scheduleOnRN(commit, cur[0], cur[1], cur[2]);
    }
  );

  const fitKey = fit.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');
  const padKey = `${padding.top},${padding.bottom},${padding.left},${padding.right}`;

  const flyTo = useCallback(
    (cam: Camera, animate: boolean) => {
      cancelAnimation(cx);
      cancelAnimation(cy);
      cancelAnimation(z);
      if (!animate) {
        cx.value = cam.cx;
        cy.value = cam.cy;
        z.value = cam.z;
        commit(cam.cx, cam.cy, cam.z);
        return;
      }
      const cfg = { duration: 420, easing: Easing.out(Easing.cubic) };
      cx.value = withTiming(cam.cx, cfg);
      cy.value = withTiming(cam.cy, cfg);
      z.value = withTiming(cam.z, cfg, (done) => {
        if (done) scheduleOnRN(commit, cam.cx, cam.cy, cam.z);
      });
    },
    [commit, cx, cy, z]
  );

  const frameAll = useCallback(
    (animate: boolean) => {
      const cam = fitCamera(fit, size.w, size.h, padding);
      if (cam) flyTo(cam, animate);
      setMoved(false);
    },
    // fitKey and padKey stand in for fit and padding, which are new arrays
    // and objects on every render of the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitKey, padKey, size.w, size.h, flyTo]
  );

  // Frame on first layout, then glide whenever what should be framed changes.
  const [framedOnce, setFramedOnce] = useState(false);
  useEffect(() => {
    if (size.w === 0) return;
    frameAll(framedOnce);
    if (!framedOnce) setFramedOnce(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameAll, size.w]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    fw.value = width;
    fh.value = height;
    if (Math.round(width) !== size.w || Math.round(height) !== size.h) {
      setSize({ w: Math.round(width), h: Math.round(height) });
    }
  };

  const markMoved = useCallback(() => setMoved(true), []);

  const meUnit = useMemo(() => (me ? toUnit(me.lat, me.lng) : null), [me]);

  /** Centre the camera on this phone, inside the padded area, close enough to see the street. */
  const showMe = useCallback(() => {
    if (!meUnit || size.w === 0) return;
    const nz = Math.max(z.value, 15);
    const world = TILE * 2 ** nz;
    const aw = size.w - padding.left - padding.right;
    const ah = size.h - padding.top - padding.bottom;
    const offX = padding.left + aw / 2 - size.w / 2;
    const offY = padding.top + ah / 2 - size.h / 2;
    flyTo({ cx: meUnit.x - offX / world, cy: meUnit.y - offY / world, z: nz }, true);
    setMoved(true);
    // padKey stands in for padding, a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meUnit, size.w, size.h, padKey, flyTo, z]);

  // One finger drags, two fingers pinch and drag together, two taps zoom in.
  const pinchX = useSharedValue(0);
  const pinchY = useSharedValue(0);
  const pinchZ = useSharedValue(0);

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      cancelAnimation(cx);
      cancelAnimation(cy);
      scheduleOnRN(markMoved);
    })
    .onChange((e) => {
      const world = TILE * 2 ** z.value;
      cx.value -= e.changeX / world;
      cy.value = clamp(cy.value - e.changeY / world, 0, 1);
    })
    .onEnd((e) => {
      const world = TILE * 2 ** z.value;
      cx.value = withDecay({ velocity: -e.velocityX / world, deceleration: 0.996 });
      cy.value = withDecay({ velocity: -e.velocityY / world, deceleration: 0.996 }, () => {
        scheduleOnRN(commit, cx.value, cy.value, z.value);
      });
    });

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      cancelAnimation(cx);
      cancelAnimation(cy);
      cancelAnimation(z);
      const world = TILE * 2 ** z.value;
      // The point under the fingers, which is what stays under them.
      pinchX.value = cx.value + (e.focalX - fw.value / 2) / world;
      pinchY.value = cy.value + (e.focalY - fh.value / 2) / world;
      pinchZ.value = z.value;
      scheduleOnRN(markMoved);
    })
    .onChange((e) => {
      const nz = clamp(pinchZ.value + Math.log2(e.scale), MIN_Z, MAX_Z);
      const world = TILE * 2 ** nz;
      z.value = nz;
      cx.value = pinchX.value - (e.focalX - fw.value / 2) / world;
      cy.value = pinchY.value - (e.focalY - fh.value / 2) / world;
    })
    .onEnd(() => {
      scheduleOnRN(commit, cx.value, cy.value, z.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd((e) => {
      const world = TILE * 2 ** z.value;
      const px = cx.value + (e.x - fw.value / 2) / world;
      const py = cy.value + (e.y - fh.value / 2) / world;
      const nz = clamp(z.value + 1, MIN_Z, MAX_Z);
      const nworld = TILE * 2 ** nz;
      const cfg = { duration: 260, easing: Easing.out(Easing.cubic) };
      cx.value = withTiming(px - (e.x - fw.value / 2) / nworld, cfg);
      cy.value = withTiming(py - (e.y - fh.value / 2) / nworld, cfg);
      z.value = withTiming(nz, cfg, () => {
        scheduleOnRN(commit, cx.value, cy.value, z.value);
      });
      scheduleOnRN(markMoved);
    });

  // A single tap waits for the double tap to fail, so zooming in never also
  // picks a marker. It only exists when something on the map is tappable.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .enabled(!!onMarkerPress)
    .onEnd((e) => {
      scheduleOnRN(tapAt, e.x, e.y, cx.value, cy.value, z.value);
    });

  const gesture = Gesture.Simultaneous(pan, pinch, Gesture.Exclusive(doubleTap, singleTap));

  // The layer is laid out in fixed deep zoom pixels around a fixed anchor, so
  // placing it depends on the live camera alone. Nothing React draws later can
  // disagree with it, which is what keeps the map still while it re-renders.
  const layerStyle = useAnimatedStyle(() => {
    const world = TILE * 2 ** z.value;
    return {
      transform: [
        { translateX: (ANCHOR.x - cx.value) * world + fw.value / 2 },
        { translateY: (ANCHOR.y - cy.value) * world + fh.value / 2 },
        { scale: 2 ** (z.value - Z0) },
      ],
    };
  });

  // Unit square positions of everything drawn, worked out once per change.
  const unitRoutes = useMemo(
    () =>
      routes
        .filter((r) => r.points.length >= 2)
        .map((r) => ({ ...r, unit: r.points.map((p) => toUnit(p.lat, p.lng)) })),
    [routes]
  );
  const unitMarkers = useMemo(
    () => markers.map((m) => ({ ...m, ...toUnit(m.lat, m.lng) })),
    [markers]
  );

  /** Which tappable markers are under a tap, worked out from where the camera was. */
  function tapAt(x: number, y: number, ccx: number, ccy: number, cz: number) {
    if (!onMarkerPress) return;
    const world = TILE * 2 ** cz;
    const hits = unitMarkers
      .filter((m) => m.tap !== undefined)
      .map((m) => ({
        tap: m.tap as string,
        d: Math.hypot((m.x - ccx) * world + size.w / 2 - x, (m.y - ccy) * world + size.h / 2 - y),
      }))
      .filter((h) => h.d <= HIT)
      .sort((a, b) => a.d - b.d);
    const taps = [...new Set(hits.map((h) => h.tap))];
    if (taps.length > 0) onMarkerPress(taps);
  }

  // Routes in level pixels, simplified to what the current tile level can
  // show. Worked out once per level, not once per frame.
  const level = drawn?.lz ?? MIN_Z;
  const layerRoutes = useMemo(() => {
    const unitToLayer = TILE * 2 ** level;
    // About six tenths of a screen pixel, since a level pixel is roughly one.
    const tolerance = 0.6;
    return [...unitRoutes]
      // Muted first, so the route this screen is about is drawn on top.
      .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'muted' ? -1 : 1))
      .map((r) => ({
        id: r.id,
        tone: r.tone,
        pts: simplify(
          r.unit.map((u) => ({ x: (u.x - ANCHOR.x) * unitToLayer, y: (u.y - ANCHOR.y) * unitToLayer })),
          tolerance
        ),
      }));
  }, [unitRoutes, level]);

  let tiles: { key: string; uri: string; left: number; top: number; size: number }[] = [];
  let area = { left: 0, top: 0, width: 0, height: 0 };
  // Level pixels per screen pixel at the drawn zoom. Line widths are scaled by
  // it so a route keeps its weight on screen whatever the zoom.
  let perScreenPx = 1;
  if (drawn && size.w > 0) {
    const n = 2 ** drawn.lz;
    const world = TILE * 2 ** drawn.z;
    const halfX = size.w / 2 / world;
    const halfY = size.h / 2 / world;
    const x0 = Math.floor((drawn.cx - halfX) * n) - MARGIN;
    const x1 = Math.floor((drawn.cx + halfX) * n) + MARGIN;
    const y0 = Math.max(0, Math.floor((drawn.cy - halfY) * n) - MARGIN);
    const y1 = Math.min(n - 1, Math.floor((drawn.cy + halfY) * n) + MARGIN);
    perScreenPx = 2 ** (drawn.lz - drawn.z);

    // One tile of this level, in level pixels, is simply a tile.
    const tileSize = TILE;
    const unitToLayer = TILE * 2 ** drawn.lz;
    const originX = -ANCHOR.x * unitToLayer;
    const originY = -ANCHOR.y * unitToLayer;

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const wrapped = ((x % n) + n) % n;
        tiles.push({
          key: `${drawn.lz}/${x}/${y}`,
          uri: tileUrl(drawn.lz, wrapped, y),
          left: originX + x * tileSize,
          top: originY + y * tileSize,
          size: tileSize,
        });
      }
    }
    area = {
      left: originX + x0 * tileSize,
      top: originY + y0 * tileSize,
      width: (x1 - x0 + 1) * tileSize,
      height: (y1 - y0 + 1) * tileSize,
    };
  }
  if (!MAPBOX_READY) tiles = [];

  /*
    The route is drawn as short native views, one per segment, laid out in the
    same anchor pixels as the tiles. Not SVG: react-native-svg on Android
    paints into a bitmap the size of its view, and a route layer covering a few
    screens at a low zoom is tens of megabytes, redrawn on every pan. A few
    hundred plain views cost almost nothing and stay sharp at any scale.

    Each segment has round ends, so where two meet the join is round too.
  */
  type Seg = { key: string; left: number; top: number; width: number; height: number; angle: number; tone: 'casing' | 'primary' | 'muted' };
  const segments: Seg[] = [];
  if (drawn) {
    const fx0 = area.left;
    const fy0 = area.top;
    const fx1 = area.left + area.width;
    const fy1 = area.top + area.height;
    const passes: { tone: 'casing' | 'line'; primaryOnly: boolean }[] = [
      { tone: 'casing', primaryOnly: true },
      { tone: 'line', primaryOnly: false },
    ];
    for (const pass of passes) {
      for (const r of layerRoutes) {
        if (pass.primaryOnly && r.tone !== 'primary') continue;
        const tone: Seg['tone'] = pass.tone === 'casing' ? 'casing' : r.tone;
        // Screen pixels: a wide pine band under a lime line, muted a bit thinner.
        // Kept slim so the route reads without covering the streets under it.
        const sw = (tone === 'casing' ? 14 : tone === 'primary' ? 4 : 3) * perScreenPx;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const ax1 = r.pts[i].x;
          const ay1 = r.pts[i].y;
          const bx = r.pts[i + 1].x;
          const by = r.pts[i + 1].y;
          // Only the segments that touch the drawn area.
          if (Math.max(ax1, bx) < fx0 || Math.min(ax1, bx) > fx1) continue;
          if (Math.max(ay1, by) < fy0 || Math.min(ay1, by) > fy1) continue;
          const len = Math.hypot(bx - ax1, by - ay1);
          const mx = (ax1 + bx) / 2;
          const my = (ay1 + by) / 2;
          segments.push({
            key: `${r.id}-${tone}-${i}`,
            left: mx - (len + sw) / 2,
            top: my - sw / 2,
            width: len + sw,
            height: sw,
            angle: Math.atan2(by - ay1, bx - ax1),
            tone,
          });
        }
      }
    }
  }

  const trouble = !MAPBOX_READY
    ? __DEV__
      ? 'No Mapbox token in this build. Restart with npx expo start --clear.'
      : 'The map is not available in this version. Rides still work.'
    : tilesFailed
      ? 'The map did not load. Check your connection.'
      : null;


  return (
    <View style={s.wrap} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[s.layer, layerStyle]} pointerEvents="none">
            {/*
              Keyed by level, and scaled in the same render that lays out its
              children, so the tiles and the scale that fits them always
              arrive on screen together.
            */}
            <View key={level} style={[s.layer, { transform: [{ scale: 2 ** (Z0 - level) }] }]}>
              {tiles.map((t) => (
                <Image
                  key={t.key}
                  source={{ uri: t.uri }}
                  cachePolicy="memory-disk"
                  transition={120}
                  recyclingKey={t.key}
                  // One point of overlap hides the seams rounding leaves between tiles.
                  style={[s.tile, { left: t.left, top: t.top, width: t.size + 1, height: t.size + 1 }]}
                  onError={() => setTilesFailed(true)}
                />
              ))}

              {segments.map((g) => (
                <View
                  key={g.key}
                  style={[
                    s.segment,
                    g.tone === 'casing' ? s.segCasing : g.tone === 'primary' ? s.segPrimary : s.segMuted,
                    {
                      left: g.left,
                      top: g.top,
                      width: g.width,
                      height: g.height,
                      borderRadius: g.height / 2,
                      transform: [{ rotate: `${g.angle}rad` }],
                    },
                  ]}
                />
              ))}
            </View>
          </Animated.View>

          {unitMarkers.map((m) => (
            <Marker key={m.id} marker={m} cx={cx} cy={cy} z={z} fw={fw} fh={fh} />
          ))}

          {meUnit ? <MeDot x={meUnit.x} y={meUnit.y} cx={cx} cy={cy} z={z} fw={fw} fh={fh} /> : null}
        </View>
      </GestureDetector>

      {/* Bottom right corner, whatever the padding; only a sheet lifts it. */}
      <View style={[s.controls, { bottom: controlsBottom, right: space.md }]} pointerEvents="box-none">
        {meUnit && showFrameButton ? (
          <Pressable
            onPress={showMe}
            accessibilityRole="button"
            accessibilityLabel="Show where I am"
            style={({ pressed }) => [s.frameButton, pressed && s.pressed]}>
            <LocateIcon size={20} tint={CHIP_INK} />
          </Pressable>
        ) : null}
        {showFrameButton && moved ? (
          <Pressable
            onPress={() => frameAll(true)}
            accessibilityRole="button"
            accessibilityLabel="Show the whole route"
            style={({ pressed }) => [s.frameButton, pressed && s.pressed]}>
            <FrameIcon size={20} tint={CHIP_INK} />
          </Pressable>
        ) : null}
      </View>

      {trouble ? (
        <View style={[s.trouble, { top: padding.top + space.sm }]} pointerEvents="none">
          <Text variant="small" style={s.troubleText}>
            {trouble}
          </Text>
        </View>
      ) : null}

      {/* Required by the Mapbox terms. Not decoration, do not remove. */}
      <View style={[s.credit, { bottom: padding.bottom + 4 }]} pointerEvents="none">
        <Text variant="small" tone="faint" style={s.creditText}>
          © Mapbox © OpenStreetMap
        </Text>
      </View>
    </View>
  );
}

/**
 * You, as a blue dot with a soft halo: the convention every map app uses, so
 * nobody has to learn it. Each new reading glides the dot there over about a
 * second rather than jumping, which is roughly how often readings come in.
 */
function MeDot({
  x,
  y,
  cx,
  cy,
  z,
  fw,
  fh,
}: {
  x: number;
  y: number;
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  z: SharedValue<number>;
  fw: SharedValue<number>;
  fh: SharedValue<number>;
}) {
  const mx = useSharedValue(x);
  const my = useSharedValue(y);
  useEffect(() => {
    const cfg = { duration: 900, easing: Easing.linear };
    mx.value = withTiming(x, cfg);
    my.value = withTiming(y, cfg);
  }, [x, y, mx, my]);

  const style = useAnimatedStyle(() => {
    const world = TILE * 2 ** z.value;
    return {
      transform: [
        { translateX: (mx.value - cx.value) * world + fw.value / 2 },
        { translateY: (my.value - cy.value) * world + fh.value / 2 },
      ],
    };
  });

  return (
    <Animated.View style={[s.marker, style]} pointerEvents="none" accessibilityLabel="You are here">
      <View style={s.markerBox}>
        <View style={s.meHalo} />
        <View style={s.meDot} />
      </View>
    </Animated.View>
  );
}

/** A marker placed per frame in screen space, so it never scales with the map. */
function Marker({
  marker,
  cx,
  cy,
  z,
  fw,
  fh,
}: {
  marker: MapMarker & { x: number; y: number };
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  z: SharedValue<number>;
  fw: SharedValue<number>;
  fh: SharedValue<number>;
}) {
  const { x, y } = marker;
  const style = useAnimatedStyle(() => {
    const world = TILE * 2 ** z.value;
    return {
      transform: [
        { translateX: (x - cx.value) * world + fw.value / 2 },
        { translateY: (y - cy.value) * world + fh.value / 2 },
      ],
    };
  });

  return (
    <Animated.View style={[s.marker, style]} pointerEvents="none">
      <View style={s.markerBox}>
        {marker.label ? (
          <View style={[s.label, marker.kind === 'drop' && s.labelDrop]}>
            <Text variant="small" numberOfLines={1} style={s.labelText}>
              {marker.label}
            </Text>
          </View>
        ) : null}
        {marker.kind === 'car' ? (
          <View style={s.dotCar}>
            <View style={s.dotCarInner} />
          </View>
        ) : marker.kind === 'person' ? (
          <View style={s.dotPerson}>
            <Text variant="small" style={s.dotPersonText}>
              {marker.initials ?? ''}
            </Text>
          </View>
        ) : marker.kind === 'rider' ? (
          // A number, not a name: the list under the map says who, and five
          // names on a small map is exactly the clutter to avoid.
          <View style={s.dotRider}>
            <Text variant="small" style={s.dotRiderText}>
              {marker.num ?? ''}
            </Text>
          </View>
        ) : (
          <View
            style={
              marker.kind === 'start'
                ? s.dotStart
                : marker.kind === 'end'
                  ? s.dotEnd
                  : marker.kind === 'drop'
                    ? s.dotDrop
                    : marker.kind === 'ride'
                      ? s.dotRide
                      : s.dotStop
            }
          />
        )}
      </View>
    </Animated.View>
  );
}

const BOX = 220;
const BOX_H = 120;

/** Label chips are light on both maps, so their ink never changes. */
const CHIP_INK = '#13241C';

/*
  The map's own colours, one set per map style. By day the route is pine on a
  lime band, which holds up on a pale map; at night it flips to lime on pine.
*/
function mapColours() {
  return currentScheme() === 'dark'
    ? {
        land: '#1B2421',
        band: '#24493A',
        route: LIME,
        muted: '#4C5C55',
        chip: '#F5F5F2',
        dot: '#FFFFFF',
        ring: NIGHT,
        startFill: NIGHT,
        startRing: '#FFFFFF',
      }
    : {
        land: '#F2F2EF',
        band: LIME,
        route: PINE,
        muted: '#B5BDB7',
        chip: '#FFFFFF',
        dot: PINE,
        ring: '#FFFFFF',
        startFill: '#FFFFFF',
        startRing: PINE,
      };
}

const s = themed(() => {
  const MAP = mapColours();
  return StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: MAP.land },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    transformOrigin: 'left top',
  },
  tile: { position: 'absolute' },
  segment: { position: 'absolute' },
  segCasing: { backgroundColor: MAP.band },
  segPrimary: { backgroundColor: MAP.route },
  segMuted: { backgroundColor: MAP.muted },
  marker: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  // A box centred on the point, so the dot sits exactly on it and the label
  // can float above without shifting it.
  markerBox: {
    position: 'absolute',
    left: -BOX / 2,
    top: -BOX_H / 2,
    width: BOX,
    height: BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Small on purpose. The map is there to show the road, and markers the size
  // of a fingertip turn a short corridor into clutter.
  dotStart: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: MAP.startFill,
    borderWidth: 3,
    borderColor: MAP.startRing,
  },
  dotEnd: {
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: MAP.dot,
  },
  // Another ride's pickup: the start dot, smaller and quieter.
  dotRide: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: MAP.startFill,
    borderWidth: 2.5,
    borderColor: MAP.startRing,
    opacity: 0.85,
  },
  dotStop: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: PINE,
  },
  // Your stop: lime with a soft halo, the thing on the map that is yours.
  dotDrop: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: LIME,
    borderWidth: 3,
    borderColor: currentScheme() === 'dark' ? NIGHT : PINE,
    shadowColor: LIME,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  dotRider: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: LIME,
    borderWidth: 2,
    borderColor: currentScheme() === 'dark' ? NIGHT : PINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pine on lime in both themes: the badge is the logo's own pairing.
  dotRiderText: { color: PINE, fontSize: 9, lineHeight: 11, fontWeight: '800' },
  // The driver's car, live: the biggest thing on the map, because it is the
  // thing people are watching for.
  dotCar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PINE,
    borderWidth: 3,
    borderColor: LIME,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  dotCarInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIME },
  // A waiting rider, live: their initials, so the driver knows who is where.
  dotPerson: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: PINE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  dotPersonText: { color: PINE, fontSize: 10, lineHeight: 12, fontWeight: '800' },
  label: {
    position: 'absolute',
    bottom: BOX_H / 2 + 10,
    maxWidth: 160,
    backgroundColor: MAP.chip,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  labelDrop: { backgroundColor: LIME },
  labelText: { color: CHIP_INK, fontWeight: '700', fontSize: 11, lineHeight: 14 },
  controls: { position: 'absolute', gap: space.sm, alignItems: 'flex-end' },
  meHalo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(37,124,255,0.18)',
  },
  meDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#257CFF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  // 44 points: the smallest target a thumb hits reliably.
  frameButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MAP.chip,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation,
  },
  pressed: { opacity: 0.7 },
  trouble: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    backgroundColor: MAP.chip,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    ...elevation,
  },
  troubleText: { color: '#5D6A63' },
  credit: {
    position: 'absolute',
    left: 8,
    backgroundColor: 'rgba(13,24,20,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  creditText: { fontSize: 10, lineHeight: 14, color: '#A2AFA8' },
  });
});
