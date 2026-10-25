import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { endName, seatsOpen, useStore } from '@/data/store';
import type { Destination, DropOff, Trip } from '@/data/types';
import { useRoad } from '@/lib/directions';
import { useMyLocation } from '@/lib/location';
import type { LngLat } from '@/lib/mapbox';
import { openDirections } from '@/lib/navigate';
import { clock } from '@/lib/time';
import { color, elevation, radius, space, themed } from '@/theme/tokens';
import { showDialog } from './dialog';
import { ChevronIcon } from './icons';
import { MapView, type MapMarker, type MapRoute, type Padding } from './map';
import { Button } from './primitives';
import { Text } from './text';

/**
 * Lagos, roughly from Ikeja down to the coast and out to Ajah, for a map with
 * nothing on it and no idea where the phone is. Two corners, so it frames the
 * city rather than zooming to street level on one point.
 */
const LAGOS: LngLat[] = [
  { lat: 6.62, lng: 3.3 },
  { lat: 6.42, lng: 3.6 },
];

/**
 * A ride drawn on the map: where it starts, the road, where it ends.
 *
 * With no ride to show, the map sits on this phone's own position, or on
 * Lagos when that is not known. It is never pinned to any one building.
 *
 * The drop off pin is the place the rider chose to be set down (or picked up,
 * in the morning), shown only to them and to people on their trip. Other
 * people's live positions appear only around a pickup, from lib/live.ts: the
 * car to its riders, each waiting rider to their driver.
 */
export function TripMap({
  origin,
  destination,
  dropOff,
  riderDrops,
  live,
  padding,
  controlsBottom,
}: {
  /** Where the ride starts. */
  origin?: Destination;
  /** Where the driver is going. */
  destination?: Destination;
  /** Where the viewer gets off, if they have said. */
  dropOff?: DropOff | null;
  /** The driver's view: each rider's drop off, numbered in the order they happen. */
  riderDrops?: RiderDrop[];
  /**
   * Where others on the ride are right now. Drawn on top, and never framed,
   * so the camera does not chase a moving car.
   */
  live?: LiveMarker[];
  padding?: Padding;
  /** Lifts the frame button clear of a bottom sheet. */
  controlsBottom?: number;
}) {
  const me = useMyLocation();

  // The first fix only. Framing on the live position would move the camera
  // every few metres while someone walks to the car.
  const [firstFix, setFirstFix] = useState<LngLat | null>(me);
  useEffect(() => {
    if (me && !firstFix) setFirstFix(me);
  }, [me, firstFix]);

  const points = useMemo<LngLat[]>(
    () =>
      [origin, destination]
        .filter((p): p is Destination => p !== undefined)
        .map((p) => ({ lat: p.lat, lng: p.lng })),
    [origin, destination]
  );
  const road = useRoad(points);

  const drop =
    dropOff && typeof dropOff.lat === 'number' && typeof dropOff.lng === 'number'
      ? { lat: dropOff.lat, lng: dropOff.lng }
      : null;

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (origin) out.push({ id: 'origin', lat: origin.lat, lng: origin.lng, kind: 'start', label: origin.name });
    if (destination) {
      out.push({ id: 'destination', lat: destination.lat, lng: destination.lng, kind: 'end', label: destination.name });
    }
    for (const r of riderDrops ?? []) {
      if (r.lat === undefined || r.lng === undefined) continue;
      out.push({ id: `rider-${r.id}`, lat: r.lat, lng: r.lng, kind: 'rider', num: r.num });
    }
    if (drop && dropOff) out.push({ id: 'drop', lat: drop.lat, lng: drop.lng, kind: 'drop', label: dropOff.name });
    for (const l of live ?? []) {
      out.push({ id: `live-${l.id}`, lat: l.lat, lng: l.lng, kind: l.kind, initials: l.initials, label: l.label });
    }
    return out;
  }, [origin, destination, riderDrops, drop, dropOff, live]);

  const routes = useMemo<MapRoute[]>(
    () => (road.length >= 2 ? [{ id: 'route', points: road, tone: 'primary' }] : []),
    [road]
  );

  const fit = useMemo<LngLat[]>(() => {
    const riders = (riderDrops ?? [])
      .filter((r) => r.lat !== undefined && r.lng !== undefined)
      .map((r) => ({ lat: r.lat as number, lng: r.lng as number }));
    // No ride on screen: frame where the phone is, with the drop off if set.
    const here = points.length === 0 && firstFix ? [firstFix] : [];
    const all = [...points, ...(drop ? [drop] : []), ...riders, ...here];
    return all.length > 0 ? all : LAGOS;
  }, [points, drop, riderDrops, firstFix]);

  return (
    <MapView
      routes={routes}
      markers={markers}
      fit={fit}
      padding={padding}
      controlsBottom={controlsBottom}
      me={me}
    />
  );
}

export type LiveMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: 'car' | 'person';
  initials?: string;
  label?: string;
};

export type RiderDrop = {
  id: string;
  name: string;
  /** The place they named, or undefined if they never said. */
  place?: string;
  lat?: number;
  lng?: number;
  /** 1 for the first drop off on the road. */
  num: number;
};

/**
 * The riders' drop offs on a trip, in the order the driver's road reaches
 * them. Someone who never said where they get off is listed last, with no
 * marker. Only ever shown to the driver and the people on that ride.
 */
export function useRiderDrops(trip: Trip | undefined, riderIds: string[]): RiderDrop[] {
  const { person, alongRoute } = useStore();
  const key = riderIds.join(',');
  return useMemo(() => {
    if (!trip) return [];
    return riderIds
      .map((id) => {
        const p = person(id);
        const d = p.dropOff;
        const known = typeof d?.lat === 'number' && typeof d?.lng === 'number';
        return {
          id,
          name: p.name,
          place: d?.name,
          lat: known ? d?.lat : undefined,
          lng: known ? d?.lng : undefined,
          order: known ? alongRoute(trip, { lat: d!.lat as number, lng: d!.lng as number }) : Infinity,
        };
      })
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...r }, i) => ({ ...r, num: i + 1 }));
    // The ids stand in for the array, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, key, person, alongRoute]);
}

/**
 * The drive in Google Maps: every drop off (or, in the morning, every pickup)
 * with a place, in order, then where the driver is going. For a driver on the
 * way, on their own tap.
 */
export function DirectionsButton({ trip, drops }: { trip: Trip; drops: RiderDrop[] }) {
  const stops = drops
    .filter((d) => d.lat !== undefined && d.lng !== undefined)
    .map((d) => ({ lat: d.lat as number, lng: d.lng as number }));
  const end = trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : undefined;
  if (!end && stops.length === 0) return null;

  async function go() {
    const ok = await openDirections(stops, end);
    if (!ok) {
      showDialog(
        'Google Maps did not open',
        `Try again, or follow the ${trip.direction === 'work' ? 'pickups' : 'drop offs'} listed here.`,
        [{ text: 'OK' }],
        'alert'
      );
    }
  }

  const label =
    stops.length === 0
      ? 'Directions in Google Maps'
      : trip.direction === 'work'
        ? 'Pickups in Google Maps'
        : 'Drop offs in Google Maps';
  return <Button label={label} kind="secondary" onPress={go} />;
}

/** More than this and the roads turn into a tangle nobody can read. */
const MAX_RIDES = 8;

/**
 * Tonight's rides on the map, for someone choosing one.
 *
 * Every ride is a quiet road with a small dot where it starts. One is picked
 * out, the soonest to begin with: its road is drawn in full, and a card above
 * the sheet says when it leaves and opens it. Tapping a dot or the far end of
 * another ride picks that one instead. Pickups at the same place sit on top
 * of each other, so tapping the stack again moves to the next ride in it.
 *
 * Only what the list already shows: where each ride starts and where its
 * driver is going. Nobody's position but the viewer's own.
 */
export function RidesMap({
  trips,
  dropOff,
  padding,
  controlsBottom = space.md,
  onOpen,
}: {
  /** The rides to draw, best first. Only the first few are drawn. */
  trips: Trip[];
  dropOff?: DropOff | null;
  padding?: Padding;
  controlsBottom?: number;
  onOpen: (tripId: string) => void;
}) {
  const { routeOf } = useStore();
  const me = useMyLocation();
  const [firstFix, setFirstFix] = useState<LngLat | null>(me);
  useEffect(() => {
    if (me && !firstFix) setFirstFix(me);
  }, [me, firstFix]);

  const shown = useMemo(() => trips.filter((t) => t.origin).slice(0, MAX_RIDES), [trips]);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  // The ride picked out, or the first one when nothing is (or it has gone).
  const current = shown.find((t) => t.id === picked) ?? shown[0];

  const drop = useMemo(
    () =>
      dropOff && typeof dropOff.lat === 'number' && typeof dropOff.lng === 'number'
        ? { lat: dropOff.lat, lng: dropOff.lng }
        : null,
    [dropOff]
  );

  const routes = useMemo<MapRoute[]>(
    () =>
      shown
        .map((t) => ({ id: t.id, points: routeOf(t).line, tone: t.id === current?.id ? 'primary' : 'muted' }) as MapRoute)
        .filter((r) => r.points.length >= 2),
    [shown, current, routeOf]
  );

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    // The others first, so the picked ride's dots are drawn over them.
    for (const t of shown) {
      if (t.id === current?.id || !t.origin) continue;
      out.push({ id: `start-${t.id}`, lat: t.origin.lat, lng: t.origin.lng, kind: 'ride', tap: t.id });
      if (t.destination) {
        out.push({ id: `end-${t.id}`, lat: t.destination.lat, lng: t.destination.lng, kind: 'stop', tap: t.id });
      }
    }
    if (current?.origin) {
      out.push({ id: 'start', lat: current.origin.lat, lng: current.origin.lng, kind: 'start', tap: current.id });
    }
    if (current?.destination) {
      out.push({
        id: 'end',
        lat: current.destination.lat,
        lng: current.destination.lng,
        kind: 'end',
        label: current.destination.name,
        tap: current.id,
      });
    }
    if (drop && dropOff) out.push({ id: 'drop', lat: drop.lat, lng: drop.lng, kind: 'drop', label: dropOff.name });
    return out;
  }, [shown, current, drop, dropOff]);

  // Every ride drawn, and where this phone first was, so the walk to a pickup
  // is on screen. Picking a ride does not move the camera.
  const fit = useMemo<LngLat[]>(() => {
    const all: LngLat[] = [];
    for (const t of shown) {
      if (t.origin) all.push({ lat: t.origin.lat, lng: t.origin.lng });
      if (t.destination) all.push({ lat: t.destination.lat, lng: t.destination.lng });
    }
    if (firstFix) all.push(firstFix);
    if (drop) all.push(drop);
    return all.length > 0 ? all : LAGOS;
  }, [shown, firstFix, drop]);

  function onMarkerPress(taps: string[]) {
    // Not the picked ride under the finger: pick the first that is. Only the
    // picked one there: nothing to change, the card already opens it.
    const i = current ? taps.indexOf(current.id) : -1;
    const next = i === -1 ? taps[0] : taps[(i + 1) % taps.length];
    if (next !== current?.id) setPicked(next);
  }

  const left = current ? seatsOpen(current) : 0;

  return (
    <View style={c.wrap}>
      <MapView
        routes={routes}
        markers={markers}
        fit={fit}
        padding={padding}
        controlsBottom={controlsBottom}
        me={me}
        onMarkerPress={shown.length > 1 ? onMarkerPress : undefined}
      />
      {current ? (
        <Pressable
          onPress={() => onOpen(current.id)}
          accessibilityRole="button"
          accessibilityLabel={`Ride leaving ${clock(current.departMin)} to ${endName(current)}. See this ride`}
          style={({ pressed }) => [c.card, { bottom: controlsBottom }, pressed && c.pressed]}>
          <View style={c.flex}>
            <Text variant="heading" numberOfLines={1}>
              {clock(current.departMin)} to {endName(current)}
            </Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {left === 0 ? 'Full' : `${left} ${left === 1 ? 'seat' : 'seats'} left`}
              {shown.length > 1 ? `. ${shown.length} rides on the map, tap a dot` : ''}
            </Text>
          </View>
          <ChevronIcon size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const c = themed(() =>
  StyleSheet.create({
    wrap: { flex: 1 },
    flex: { flex: 1 },
    // Left of the map buttons, which stack up the right edge.
    card: {
      position: 'absolute',
      left: space.md,
      right: space.md + 44 + space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: color.surface,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      ...elevation,
    },
    pressed: { opacity: 0.7 },
  })
);
