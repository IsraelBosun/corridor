import { useEffect, useState } from 'react';

import { MAPBOX_READY, MAPBOX_TOKEN, type LngLat } from './mapbox';

/**
 * The road a route actually takes.
 *
 * Stops alone draw a string of straight lines that cut across the lagoon,
 * which is the single thing that made the map look fake. Mapbox Directions
 * turns the same stops into the driving line, once, and the answer is kept for
 * the life of the app: the corridor does not move between one evening and the
 * next.
 *
 * These are public stops in, a public road out. No person's position is ever
 * part of the request.
 */

const cache = new Map<string, LngLat[]>();
const inflight = new Map<string, Promise<LngLat[]>>();

function keyFor(points: LngLat[]): string {
  return points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
}

async function fetchRoad(points: LngLat[]): Promise<LngLat[]> {
  const url =
    'https://api.mapbox.com/directions/v5/mapbox/driving/' +
    keyFor(points) +
    '?geometries=geojson&overview=full' +
    `&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions failed (${res.status}).`);

  const body = (await res.json()) as {
    routes?: { geometry?: { coordinates?: [number, number][] } }[];
  };
  const coords = body.routes?.[0]?.geometry?.coordinates ?? [];
  if (coords.length < 2) throw new Error('Directions returned no route.');
  return coords.map(([lng, lat]) => ({ lat, lng }));
}

/** The road already fetched for these points, if any. */
export function knownRoad(points: LngLat[]): LngLat[] | undefined {
  return cache.get(keyFor(points));
}

/**
 * The road through these points, fetched once and shared by everything that
 * asks: the map drawing it and the matching that measures against it.
 */
export function roadFor(points: LngLat[]): Promise<LngLat[]> {
  const key = keyFor(points);
  const known = cache.get(key);
  if (known) return Promise.resolve(known);
  if (!MAPBOX_READY || points.length < 2) return Promise.resolve(points);

  let job = inflight.get(key);
  if (!job) {
    job = fetchRoad(points)
      .then((line) => {
        cache.set(key, line);
        return line;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

/** The road through these points, or the straight lines until it arrives. */
export function useRoad(points: LngLat[]): LngLat[] {
  const key = keyFor(points);
  const [road, setRoad] = useState<LngLat[]>(() => cache.get(key) ?? points);

  useEffect(() => {
    const known = cache.get(key);
    if (known || points.length < 2) {
      setRoad(known ?? points);
      return;
    }
    // Straight lines while the road is on its way, so the map never waits on
    // the network to show something true.
    setRoad(points);

    let alive = true;
    roadFor(points)
      .then((line) => {
        if (alive) setRoad(line);
      })
      .catch(() => {
        // Keep the straight lines. A slightly wrong line beats no line.
      });

    return () => {
      alive = false;
    };
    // The key is the identity of the points; the array itself is new on
    // every render of the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return road;
}
