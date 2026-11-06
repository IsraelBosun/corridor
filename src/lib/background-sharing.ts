/**
 * Sharing this phone's position with a ride while Corridor is not on screen.
 *
 * The same sharing as live.ts, carried on by the phone in the background, so
 * the steps that hang on a position (a rider checked in at the pickup, the
 * ride ending at the destination) work with Google Maps in front. It runs only
 * from 30 minutes before a ride until the person is in the car or the ride is
 * over. It stops when the database says there is nobody to show it to, and
 * after the ride's time limit whatever happens.
 *
 * Android and iOS only let this start while the app is open, so it begins the
 * first time Corridor is open inside that window. Android shows a notification
 * the whole time and iOS shows its location indicator. Pausing a ride stops it.
 *
 * Positions go every 10 seconds even when the car is standing still, because
 * the ride ends only after 3 minutes at the destination. Sending only on
 * movement would go quiet in the car park and never end it.
 *
 * index.ts imports this file, so the task exists even when the phone starts
 * the JavaScript with nothing on screen. Expo Go cannot run it.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { backend } from '@/data/backend';
import { keepSessionReadableWhileLocked } from '@/lib/supabase';
import { showDialog } from '@/ui/dialog';

const TASK = 'corridor-ride-sharing';
const RIDE_KEY = 'corridor.sharing-ride';
const ASKED_KEY = 'corridor.background-asked';
const SEND_EVERY_MS = 10_000;
/** The phone is often locked in a car, and this is read in the background. */
const LOCKED_OK = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

const UNAVAILABLE =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type Ride = { tripId: string; until: number };

/** Undefined until read, since the task can start in a new JavaScript run. */
let ride: Ride | null | undefined;
let sentAt = 0;
let sending = false;
let on = false;
const listeners = new Set<() => void>();

function setOn(next: boolean) {
  if (next === on) return;
  on = next;
  listeners.forEach((l) => l());
}

async function currentRide(): Promise<Ride | null> {
  if (ride !== undefined) return ride;
  const saved = await SecureStore.getItemAsync(RIDE_KEY, LOCKED_OK);
  ride = saved ? (JSON.parse(saved) as Ride) : null;
  return ride;
}

async function onLocations(locations: Location.LocationObject[]) {
  const reading = locations[locations.length - 1];
  if (!reading || sending || Date.now() - sentAt < SEND_EVERY_MS) return;
  sending = true;
  try {
    const current = await currentRide();
    if (!current || Date.now() > current.until) {
      await stopBackgroundSharing();
      return;
    }
    const keep = await backend.sharePosition(
      current.tripId,
      reading.coords.latitude,
      reading.coords.longitude,
      reading.coords.accuracy ?? null
    );
    sentAt = Date.now();
    // The database says no once there is nobody to show it to.
    if (!keep) await stopBackgroundSharing();
  } catch {
    // No signal. Tried again with the next reading.
  } finally {
    sending = false;
  }
}

if (!UNAVAILABLE) {
  // Loaded here so Expo Go, which cannot run it, never imports it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TaskManager: typeof import('expo-task-manager') = require('expo-task-manager');
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (error || !data) return;
    await onLocations(data.locations);
  });
}

/**
 * Start for this ride, if the person allowed it. Call only while Corridor is
 * open. False means the sharing in live.ts carries on instead, which needs the
 * app on screen.
 */
export async function startBackgroundSharing(tripId: string, until: number): Promise<boolean> {
  if (UNAVAILABLE) return false;
  try {
    const { granted } = await Location.getBackgroundPermissionsAsync();
    if (!granted) {
      await stopBackgroundSharing();
      return false;
    }
    await keepSessionReadableWhileLocked();
    ride = { tripId, until };
    await SecureStore.setItemAsync(RIDE_KEY, JSON.stringify(ride), LOCKED_OK);
    if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: SEND_EVERY_MS,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Sharing your location with your ride',
          notificationBody: 'This stops when the ride is over or you are in the car.',
          notificationColor: '#123B2F',
          killServiceOnDestroy: true,
        },
      });
    }
    setOn(true);
    return true;
  } catch {
    // Location is off, or the phone refused. The app on screen still shares.
    setOn(false);
    return false;
  }
}

export async function stopBackgroundSharing(): Promise<void> {
  if (UNAVAILABLE) return;
  ride = null;
  setOn(false);
  await SecureStore.deleteItemAsync(RIDE_KEY).catch(() => {});
  const started = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
}

/** True while the phone is sharing for a ride without needing Corridor on screen. */
export function useBackgroundSharing(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on
  );
}

async function requestBackground() {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (granted) await Location.requestBackgroundPermissionsAsync();
}

/**
 * Explains and asks once, the first time this person is in a ride's window.
 * Google requires a notice like this before the phone's own permission screen.
 */
export async function offerBackgroundSharing(): Promise<void> {
  if (UNAVAILABLE) return;
  try {
    if (await SecureStore.getItemAsync(ASKED_KEY)) return;
    const { granted } = await Location.getBackgroundPermissionsAsync();
    if (granted) return;
    await SecureStore.setItemAsync(ASKED_KEY, '1');
    const android = Platform.OS === 'android' ? ' On the next screen, choose Allow all the time.' : '';
    showDialog(
      'Share your location during rides',
      `Corridor collects your location to share it with your ride, even when the app is closed or not in use. This runs only from 30 minutes before a ride until you are in the car or the ride is over.${android}`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Continue', onPress: () => void requestBackground().catch(() => {}) },
      ],
      'car'
    );
  } catch {
    // Asked another time. The ride works the same with the app on screen.
  }
}
