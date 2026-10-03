/**
 * Mapbox, and the slippy-tile arithmetic the map is drawn with.
 *
 * The token is a pk. token. Those are designed to ship inside a client and are
 * readable by anyone who unzips the app, so it lives in .env for rotation
 * rather than secrecy. Restrict it by URL in the Mapbox dashboard.
 */

import { currentScheme } from '@/theme/tokens';

export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export const MAPBOX_READY = MAPBOX_TOKEN.startsWith('pk.');

/**
 * Mapbox's light map by day, its dark map at night. Read per tile, so a theme
 * switch redraws with the other style.
 */
function style(): string {
  return currentScheme() === 'dark' ? 'mapbox/dark-v11' : 'mapbox/light-v11';
}

export const TILE = 256;

/** @2x tiles are one request each and look far better on a phone screen. */
export function tileUrl(z: number, x: number, y: number): string {
  return `https://api.mapbox.com/styles/v1/${style()}/tiles/${TILE}/${z}/${x}/${y}@2x?access_token=${MAPBOX_TOKEN}`;
}

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 18;

export type LngLat = { lat: number; lng: number };

/** Web Mercator, in tile units at a given zoom. The standard slippy scheme. */
export function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

/** The inverse, for turning a drag in pixels back into a place. */
export function unproject(x: number, y: number, z: number): LngLat {
  const n = 2 ** z;
  return {
    lng: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

/** The closest zoom that still fits a bounding box inside a frame. */
export function fitZoom(min: LngLat, max: LngLat, w: number, h: number): number {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const a = project(max.lat, min.lng, z);
    const b = project(min.lat, max.lng, z);
    // Padded, so the end stops are not pinned against the edge of the frame.
    if (Math.abs(b.x - a.x) * TILE <= w * 0.82 && Math.abs(b.y - a.y) * TILE <= h * 0.82) {
      return z;
    }
  }
  return MIN_ZOOM;
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

const EARTH_M = 6371000;

/** Great circle distance in metres. */
export function metresBetween(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(s));
}

/**
 * Where a point falls against a line between two others: the nearest point on
 * the segment, and how far along the segment that is (0 to 1).
 *
 * Flat earth arithmetic, with longitude squashed by the cosine of the latitude.
 * Over a corridor a few tens of kilometres long that is accurate to well within
 * the tolerance anybody cares about, and it avoids dragging in a geometry
 * library for one function.
 */
function projectOnSegment(p: LngLat, a: LngLat, b: LngLat): { nearest: LngLat; t: number } {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const px = p.lng * k;
  const ax = a.lng * k;
  const bx = b.lng * k;

  const dx = bx - ax;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;

  // A zero length segment is a point, which happens when a trip has one stop.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p.lat - a.lat) * dy) / lenSq));

  return { nearest: { lng: (ax + t * dx) / k, lat: a.lat + t * dy }, t };
}

/**
 * Where a place sits against a route.
 *
 * off: metres from the route to the place, which decides whether the driver
 * passes it at all. along: metres driven from the start of the route to the
 * point nearest it, which decides the order the drop offs happen in.
 *
 * This is the buffered corridor CLAUDE.md describes under Matching: take the
 * driver's line, and ask whether somewhere falls close enough to it to be on
 * the way. Distance to the nearest segment, not to the nearest point, because
 * a place halfway along a stretch of road is still on the route.
 */
export function placeOnRoute(p: LngLat, route: LngLat[]): { off: number; along: number } {
  if (route.length === 0) return { off: Infinity, along: 0 };
  if (route.length === 1) return { off: metresBetween(p, route[0]), along: 0 };

  let best = { off: Infinity, along: 0 };
  let driven = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const seg = metresBetween(a, b);
    const { nearest, t } = projectOnSegment(p, a, b);
    const off = metresBetween(p, nearest);
    if (off < best.off) best = { off, along: driven + t * seg };
    driven += seg;
  }
  return best;
}

/** How far a place is from a route, in metres. */
export function metresFromRoute(p: LngLat, route: LngLat[]): number {
  return placeOnRoute(p, route).off;
}

export type Place = {
  id: string;
  name: string;
  /** "Lekki, Lagos, Nigeria", or empty for one of our own stops. */
  context: string;
  lat: number;
  lng: number;
  /** True when this is a landmark on the corridor rather than a searched place. */
  isStop: boolean;
};

/**
 * Mapbox place search, held to Lagos.
 *
 * Without the country and proximity hints "Lekki Toll" comes back as a road in
 * Queensland, which is a real result and a useless one.
 */
export async function searchPlaces(
  query: string,
  near: LngLat,
  signal?: AbortSignal
): Promise<Place[]> {
  if (!MAPBOX_READY || query.trim().length < 3) return [];

  const url =
    'https://api.mapbox.com/search/geocode/v6/forward' +
    `?q=${encodeURIComponent(query.trim())}` +
    '&country=ng' +
    `&proximity=${near.lng},${near.lat}` +
    '&limit=6' +
    `&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status}).`);

  const body = (await res.json()) as {
    features?: {
      id?: string;
      properties?: {
        mapbox_id?: string;
        name?: string;
        place_formatted?: string;
        coordinates?: { latitude?: number; longitude?: number };
      };
    }[];
  };

  return (body.features ?? [])
    .map((f, i): Place | null => {
      const c = f.properties?.coordinates;
      if (typeof c?.latitude !== 'number' || typeof c?.longitude !== 'number') return null;
      return {
        id: f.properties?.mapbox_id ?? f.id ?? `place-${i}`,
        name: f.properties?.name ?? 'Unnamed place',
        context: f.properties?.place_formatted ?? '',
        lat: c.latitude,
        lng: c.longitude,
        isStop: false,
      };
    })
    .filter((p): p is Place => p !== null);
}
