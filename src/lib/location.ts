/**
 * Where this phone is, for the "you are here" dot.
 *
 * Shown on this person's own map and nowhere else. The position lives in
 * memory while a map is on screen: this watch never stores it, never sends it
 * to the backend and never shows it to anyone else. The one thing that does
 * keep positions is the ride track (tracking.ts), and only while a ride this
 * person is on is on the road.
 *
 * One watch is shared by every map on screen. It starts with the first map
 * and stops when the last one goes, so the GPS is not left running.
 */
import * as Location from 'expo-location';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Linking } from 'react-native';

import type { LngLat } from './mapbox';

/**
 * Where the permission stands. 'blocked' is a "no" the phone will not ask
 * again, so only the phone's settings can undo it.
 */
export type LocationAccess = 'unknown' | 'granted' | 'denied' | 'blocked';

let here: LngLat | null = null;
let access: LocationAccess = 'unknown';
let users = 0;
let watch: Location.LocationSubscription | null = null;
let starting = false;
const listeners = new Set<() => void>();

/** GPS wobbles a few metres even standing still. Smaller moves than this are not drawn. */
const WOBBLE_M = 4;

function metres(a: LngLat, b: LngLat): number {
  const k = 111_320;
  return Math.hypot((a.lat - b.lat) * k, (a.lng - b.lng) * k * Math.cos((a.lat * Math.PI) / 180));
}

function publish(next: LngLat | null) {
  if (next && here && metres(next, here) < WOBBLE_M) return;
  here = next;
  listeners.forEach((l) => l());
}

function setAccess(next: LocationAccess) {
  if (next === access) return;
  access = next;
  listeners.forEach((l) => l());
}

async function start() {
  if (watch || starting) return;
  starting = true;
  try {
    // A "no" is respected and the map simply has no dot, but the person can
    // change their mind: see askForLocation.
    const { granted, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    setAccess(granted ? 'granted' : canAskAgain ? 'denied' : 'blocked');
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

/**
 * After a "no": ask again if the phone still allows it, otherwise open this
 * app's page in the phone's settings. Coming back from there is picked up by
 * the listener below.
 */
export function askForLocation() {
  if (access === 'blocked') {
    Linking.openSettings().catch(() => {});
    return;
  }
  start();
}

// Back from the phone's settings with location now allowed: start the dot.
AppState.addEventListener('change', (state) => {
  if (state !== 'active' || users === 0 || access === 'granted' || access === 'unknown') return;
  Location.getForegroundPermissionsAsync()
    .then(({ granted }) => {
      if (granted) start();
    })
    .catch(() => {});
});

/** Where the location permission stands, redrawn when it changes. */
export function useLocationAccess(): LocationAccess {
  return useSyncExternalStore(subscribe, () => access);
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
