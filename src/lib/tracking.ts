/**
 * The ride track: where this phone is while its ride is on the road.
 *
 * Kept for safety, so that after a complaint the route a car actually took can
 * be seen. It records only while a ride this person is on (driving it, or
 * riding in it) has set off and is not yet over for them, and only while
 * Corridor is open on screen. It stops when they say they have been dropped
 * off, when the driver says everyone is, and after three hours whatever
 * happens. The database refuses points for any other ride or time.
 *
 * Every 15 seconds or 50 metres, sent in batches every 30 seconds. A batch
 * that fails to send is kept and sent with the next one.
 *
 * Separate from location.ts, which is the "you are here" dot and keeps
 * nothing. Both share the one location permission.
 */
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { backend, type TrackPoint } from '@/data/backend';
import { useStore } from '@/data/store';

const SEND_EVERY_MS = 30_000;
const MAX_BATCH = 300;
/** What is kept on the phone while sends keep failing: about two hours. */
const MAX_HELD = 500;

/** True while Corridor is on screen. */
function useForeground(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** Start recording for one ride. Returns the way to stop. */
function startTrack(tripId: string): () => void {
  let held: TrackPoint[] = [];
  let watch: Location.LocationSubscription | null = null;
  let stopped = false;
  let sending = false;

  function end() {
    stopped = true;
    watch?.remove();
    watch = null;
  }

  async function send() {
    if (sending || held.length === 0) return;
    sending = true;
    const batch = held.slice(0, MAX_BATCH);
    try {
      const kept = await backend.recordTrack(tripId, batch);
      held = held.slice(batch.length);
      // The database only says none when the ride is no longer on the road.
      if (kept === 0) end();
    } catch {
      // Kept for the next send. Oldest go first if it never gets through.
      if (held.length > MAX_HELD) held = held.slice(-MAX_HELD);
    } finally {
      sending = false;
    }
  }

  (async () => {
    let { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) ({ granted } = await Location.requestForegroundPermissionsAsync());
    if (!granted || stopped) return;
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 15_000 },
      (pos) => {
        held.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? null,
          at: new Date(pos.timestamp).toISOString(),
        });
      }
    );
    if (stopped) sub.remove();
    else watch = sub;
  })().catch(() => {
    // No GPS or location off. The ride goes on without a track.
  });

  const timer = setInterval(send, SEND_EVERY_MS);
  return () => {
    clearInterval(timer);
    end();
    // Whatever is held goes now, before the app goes to the background.
    send();
  };
}

/** The ride this person is on that is on the road right now, if any. */
function useRideOnTheRoad(): string | undefined {
  const { trips, me, underway } = useStore();
  return useMemo(() => {
    if (!me) return undefined;
    // After setting off, only riders who got in still hold a seat.
    return trips.find((t) => underway(t) && (t.driverId === me.id || t.riders.includes(me.id)))?.id;
  }, [trips, me, underway]);
}

/** Mounted once, inside the store. Records while a ride is on the road. */
export function RideTracker() {
  const tripId = useRideOnTheRoad();
  const foreground = useForeground();

  useEffect(() => {
    if (!tripId || !foreground) return;
    return startTrack(tripId);
  }, [tripId, foreground]);

  return null;
}
