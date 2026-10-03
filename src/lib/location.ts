/**
 * Where this phone is, for the "you are here" dot.
 *
 * Shown on this person's own map and nowhere else. The position lives in
 * memory while a map is on screen: it is never stored, never sent to the
 * backend and never shown to anyone else, which keeps the promise on the
 * Account page that nothing is kept about where people have been.
 *
 * One watch is shared by every map on screen. It starts with the first map
 * and stops when the last one goes, so the GPS is not left running.
 */
import * as Location from 'expo-location';
import { useEffect, useSyncExternalStore } from 'react';

import type { LngLat } from './mapbox';

let here: LngLat | null = null;
let users = 0;
let watch: Location.LocationSubscription | null = null;
let starting = false;
const listeners = new Set<() => void>();

function publish(next: LngLat | null) {
  here = next;
  listeners.forEach((l) => l());
}

async function start() {
  if (watch || starting) return;
  starting = true;
  try {
    // Asked once; a "no" is respected and the map simply has no dot.
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted || users === 0) return;

    // A quick first fix from the last known position, so the dot appears
    // straight away instead of after the first GPS reading.
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last && users > 0) publish({ lat: last.coords.latitude, lng: last.coords.longitude });

    const sub = await Location.watchPositionAsync(
      // Every 10 m or 3 s, whichever comes later: enough to follow a car
      // through traffic without draining the battery on a walk to the gate.
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
      (pos) => publish({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    );
    // The last map may have gone while the watch was starting.
    if (users === 0) sub.remove();
    else watch = sub;
  } catch {
    // Location off, or no GPS. The map works the same without the dot.
  } finally {
    starting = false;
  }
}

function stop() {
  watch?.remove();
  watch = null;
  publish(null);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** This phone's position while the calling component is mounted, or null. */
export function useMyLocation(enabled = true): LngLat | null {
  useEffect(() => {
    if (!enabled) return;
    users += 1;
    start();
    return () => {
      users -= 1;
      if (users === 0) stop();
    };
  }, [enabled]);

  const value = useSyncExternalStore(subscribe, () => here);
  return enabled ? value : null;
}
