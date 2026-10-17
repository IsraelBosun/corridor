/**
 * Pushes from the server, as opposed to the reminders scheduled on the phone.
 *
 * The phone's Expo push token is saved against whoever is signed in. The
 * database does the sending (supabase/migrations/20261017140000_seat_push.sql):
 * a driver hears it, with sound, when someone takes a seat on their ride.
 *
 * iOS needs the APNs key set up in EAS, and Android needs Firebase set up in
 * a native build. Until then getting a token fails and nothing is saved; the
 * app carries on without pushes.
 */
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

import { backend } from '@/data/backend';

const CHANNEL = 'rides';

/** The token saved this session, so signing out can take it back. */
let saved: string | null = null;

/**
 * Ask once, then save this phone's token for the signed in person. Never
 * throws. N is expo-notifications as loaded by reminders.ts, null where it
 * cannot run.
 */
export async function registerForPush(N: typeof NotificationsModule | null): Promise<void> {
  const os = Platform.OS;
  if (!N || (os !== 'ios' && os !== 'android')) return;
  try {
    let { granted, canAskAgain } = await N.getPermissionsAsync();
    if (!granted && canAskAgain) {
      ({ granted } = await N.requestPermissionsAsync());
    }
    if (!granted) return;

    if (os === 'android') {
      // High, so it sounds and drops down over whatever is open.
      await N.setNotificationChannelAsync(CHANNEL, {
        name: 'Your rides',
        description: 'When someone takes a seat on your ride.',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    await backend.savePushToken(data, os);
    saved = data;
  } catch {
    // No pushes on this phone for now. Everything else works the same.
  }
}

/** Before signing out, so the next person on this phone gets none of these. */
export async function forgetPush(): Promise<void> {
  if (!saved) return;
  const token = saved;
  saved = null;
  await backend.forgetPushToken(token).catch(() => {});
}
