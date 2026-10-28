/**
 * Live location around the pickup: the driver's car for the riders, and each
 * rider still waiting for the driver.
 *
 * From 30 minutes before a ride is due, this phone sends where it is every 5
 * seconds or so while Corridor is open. The driver sends until the ride is
 * over. A rider sends until they are in the car: on an evening ride, until
 * they check in at the start; on a morning ride, until the driver picks them
 * up. Riders never see each other. The database keeps only the latest point
 * per person per ride and decides who may read it
 * (supabase/migrations/20261021120000_morning_rides_and_live_location.sql).
 *
 * Anyone can pause it for a ride, which takes their point off straight away.
 * Separate from tracking.ts, the safety record of the drive itself, and from
 * location.ts, the "you are here" dot. All three share one permission.
 */
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { backend, type LivePositionRow } from '@/data/backend';
import { useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { useNow } from './time';

const BEFORE_MS = 30 * 60 * 1000;
const AFTER_MS = 3 * 60 * 60 * 1000;
const SEND_EVERY_MS = 5_000;
/** Sent even without a new reading, so a car waiting at a light does not look lost. */
const REFRESH_MS = 60_000;
const READ_EVERY_MS = 5_000;
const PAUSED_KEY = 'corridor.live-paused';

/** Is this ride in its live window: from 30 minutes before it is due until 3 hours after. */
export function inLiveWindow(t: Trip, nowMs = Date.now()): boolean {
  if (t.status !== 'posted' && t.status !== 'boarding' && t.status !== 'left') return false;
  return nowMs >= t.departAt - BEFORE_MS && nowMs <= t.departAt + AFTER_MS;
}

/**
 * Is this rider still waiting to be collected: before an evening ride sets
 * off, or until a morning driver has them in the car.
 */
export function stillWaiting(t: Trip, riderId: string): boolean {
  if (!t.riders.includes(riderId) || t.presentAt[riderId]) return false;
  return t.status !== 'left' || t.direction === 'work';
}

/* Paused rides, by id. Kept on this phone so a restart does not undo a pause. */
let paused = new Set<string>();
const pauseListeners = new Set<() => void>();
SecureStore.getItemAsync(PAUSED_KEY)
  .then((v) => {
    if (!v) return;
    paused = new Set(JSON.parse(v) as string[]);
    pauseListeners.forEach((l) => l());
  })
  .catch(() => {});

export function setPaused(tripId: string, on: boolean) {
  const next = new Set(paused);
  if (on) next.add(tripId);
  else next.delete(tripId);
  paused = next;
  pauseListeners.forEach((l) => l());
  // Only the last few matter; rides are a day long.
  SecureStore.setItemAsync(PAUSED_KEY, JSON.stringify([...next].slice(-10))).catch(() => {});
  if (on) backend.stopSharing(tripId).catch(() => {});
}

export function usePaused(tripId: string | undefined): boolean {
  const set = useSyncExternalStore(
    (l) => {
      pauseListeners.add(l);
      return () => pauseListeners.delete(l);
    },
    () => paused
  );
  return tripId ? set.has(tripId) : false;
}

/** True while Corridor is on screen. */
function useForeground(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * The ride this phone is sharing its position with right now, if any, and
 * whether that is as its driver.
 */
export function useSharingRide(): { trip: Trip; driving: boolean } | undefined {
  const { trips, me, underway } = useStore();
  const now = useNow();
  return useMemo(() => {
    if (!me) return undefined;
    const nowMs = Date.now();
    for (const t of trips) {
      if (!inLiveWindow(t, nowMs)) continue;
      if (t.status === 'left' && !underway(t)) continue;
      // A driver on the road alone has nobody to show the car to.
      if (t.driverId === me.id && (t.status !== 'left' || t.riders.length > 0)) {
        return { trip: t, driving: true };
      }
      if (t.driverId !== me.id && stillWaiting(t, me.id)) return { trip: t, driving: false };
    }
    return undefined;
    // now is read so the window opens and closes with the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, me, underway, now]);
}

/** Send this phone's position for one ride. Returns the way to stop. */
function startSharing(tripId: string): () => void {
  let watch: Location.LocationSubscription | null = null;
  let stopped = false;
  let latest: Location.LocationObject | null = null;
  let sentAt = 0;
  let sentReading: Location.LocationObject | null = null;
  let sending = false;

  function end() {
    stopped = true;
    watch?.remove();
    watch = null;
  }

  async function send() {
    if (sending || stopped || !latest) return;
    const fresh = latest !== sentReading;
    if (!fresh && Date.now() - sentAt < REFRESH_MS) return;
    sending = true;
    const reading = latest;
    try {
      const keep = await backend.sharePosition(
        tripId,
        reading.coords.latitude,
        reading.coords.longitude,
        reading.coords.accuracy ?? null
      );
      sentReading = reading;
      sentAt = Date.now();
      // The database says no once there is nobody to show it to.
      if (!keep) end();
    } catch {
      // Tried again on the next tick.
    } finally {
      sending = false;
    }
  }

  (async () => {
    let { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) ({ granted } = await Location.requestForegroundPermissionsAsync());
    if (!granted || stopped) return;
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last && !latest) {
      latest = last;
      send();
    }
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: SEND_EVERY_MS },
      (pos) => {
        latest = pos;
      }
    );
    if (stopped) sub.remove();
    else watch = sub;
  })().catch(() => {
    // No GPS or location off. The others just do not see this phone.
  });

  const timer = setInterval(send, SEND_EVERY_MS);
  return () => {
    clearInterval(timer);
    end();
  };
}

/** Mounted once, beside the ride tracker. Shares while a ride is in its window. */
export function LiveSharer() {
  const sharing = useSharingRide();
  const foreground = useForeground();
  const tripId = sharing?.trip.id;
  const off = usePaused(tripId);

  useEffect(() => {
    if (!tripId || !foreground || off) return;
    return startSharing(tripId);
  }, [tripId, foreground, off]);

  return null;
}

export type LivePoint = { id: string; lat: number; lng: number; at: number };

/**
 * Where the others on this ride are, as far as this person may see: the
 * driver sees each rider still waiting, a rider sees the driver. Asked every
 * 5 seconds while the screen is open and the ride is in its window.
 */
export function useRidePositions(trip: Trip | undefined): LivePoint[] {
  const foreground = useForeground();
  // Redraws as the clock moves, so the window opens on time.
  useNow();
  const open = Boolean(trip && inLiveWindow(trip));
  const tripId = trip?.id;
  const [points, setPoints] = useState<LivePoint[]>([]);

  useEffect(() => {
    if (!tripId || !open || !foreground) {
      setPoints([]);
      return;
    }
    let alive = true;
    const read = () =>
      backend
        .ridePositions(tripId)
        .then((rows: LivePositionRow[]) => {
          if (alive) {
            setPoints(rows.map((r) => ({ id: r.user_id, lat: r.lat, lng: r.lng, at: new Date(r.at).getTime() })));
          }
        })
        .catch(() => {
          // Keep what is on screen. The age shown under it tells the truth.
        });
    read();
    const timer = setInterval(read, READ_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tripId, open, foreground]);

  return points;
}

/** "just now", "40 s ago", "3 min ago". */
export function ageText(at: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - at) / 1000));
  if (s < 15) return 'just now';
  if (s < 60) return `${Math.round(s / 5) * 5} s ago`;
  return `${Math.round(s / 60)} min ago`;
}
