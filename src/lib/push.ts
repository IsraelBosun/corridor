/**
 * Pushes from the server, as opposed to the reminders scheduled on the phone.
 *
 * The phone's Expo push token is saved against whoever is signed in. The
 * database does the sending (supabase/migrations/20261017140000_seat_push.sql):
 * a driver hears it, with sound, when someone takes a seat on their ride.
 *
 * iOS needs the APNs key set up in EAS. Android needs google-services.json
 * (Firebase project corridor-2de2e) built into the app, plus the FCM V1
 * service account key uploaded to EAS credentials. Builds made before that
 * get no token; the app carries on without pushes and asks the person to
 * update from the Play Store.
 */
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { backend } from '@/data/backend';
import { showDialog } from '@/ui/dialog';

const CHANNEL = 'rides';

const STORE = 'market://details?id=com.bluehydra.corridor';
const STORE_WEB = 'https://play.google.com/store/apps/details?id=com.bluehydra.corridor';

/**
 * Android builds made before Firebase was added (version code 2 and older)
 * fail to get any token, with "Default FirebaseApp is not initialized". Only
 * a new build from the Play Store fixes that, so say so.
 */
function outdatedBuild(e: unknown): boolean {
  return Platform.OS === 'android' && /firebase/i.test(e instanceof Error ? e.message : String(e));
}

function askToUpdate() {
  showDialog(
    'Update Corridor',
    'This version cannot get ride notifications. Update from the Play Store to hear when someone takes your seat or messages you.',
    [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Update',
        onPress: () => {
          Linking.openURL(STORE).catch(() => Linking.openURL(STORE_WEB).catch(() => {}));
        },
      },
    ],
    'alert'
  );
}

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
    if (!granted) {
      // The Android device token needs no permission, so this still finds an
      // old build for someone who said no to notifications.
      if (os === 'android') await N.getDevicePushTokenAsync();
      return;
    }

    if (os === 'android') {
      // High, so it sounds and drops down over whatever is open.
      await N.setNotificationChannelAsync(CHANNEL, {
        name: 'Your rides',
        description: 'Seats taken, ride changes and new messages.',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    await backend.savePushToken(data, os);
    saved = data;
  } catch (e) {
    // No pushes on this phone for now. Everything else works the same.
    if (outdatedBuild(e)) askToUpdate();
  }
}

/** Before signing out, so the next person on this phone gets none of these. */
export async function forgetPush(): Promise<void> {
  if (!saved) return;
  const token = saved;
  saved = null;
  await backend.forgetPushToken(token).catch(() => {});
}
