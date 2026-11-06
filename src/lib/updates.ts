/**
 * Over the air updates, through EAS Update.
 *
 * A JavaScript change (screens, copy, styling, logic) is published with
 * `eas update` and reaches installed apps without a new APK. Anything native
 * (a new Expo module, a permission, the icon or splash) still needs a build,
 * and the runtime version in app.json keeps an update from landing on a build
 * whose native side does not match it.
 *
 * The app checks when it opens and whenever it comes back to the front, at
 * most every half hour. A new update downloads quietly; the person is then
 * offered a restart. Saying "later" is fine: the downloaded update is used on
 * the next cold start anyway.
 *
 * A new store version is separate. On Android builds from 1.1.0, Google Play's
 * own update screen (modules/play-update) offers it. Everyone else gets a
 * dialog with a store link: set NEWEST_IN_STORE once a version is live, and
 * publish that as an update for the old version. Neither is shown during a
 * ride, nor more than once every 3 days.
 */
import { requireOptionalNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { useSharingRide } from '@/lib/live';
import { STORE, STORE_WEB } from '@/lib/push';
import { showDialog } from '@/ui/dialog';

const EVERY_MS = 30 * 60 * 1000;

/** The version live in each store. Null until it has been approved. */
const NEWEST_IN_STORE: { ios: string | null; android: string | null } = { ios: null, android: null };
const APP_STORE = 'https://apps.apple.com/app/id6823738923';
const STORE_ASKED_KEY = 'corridor.store-update-asked';
const STORE_ASK_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

/** Only in Android builds from 1.1.0, and null in Expo Go. */
const PlayUpdate = requireOptionalNativeModule<{ promptIfAvailable(): Promise<boolean> }>('PlayUpdate');

let lastCheck = 0;
let busy = false;
/** Set once an update is downloaded, so it is offered once, not on every return. */
let offered = false;

async function check() {
  // Development builds and Expo Go load from the dev server, not EAS Update.
  if (__DEV__ || !Updates.isEnabled || busy || offered) return;
  if (Date.now() - lastCheck < EVERY_MS) return;
  busy = true;
  lastCheck = Date.now();
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (!isAvailable) return;
    const { isNew } = await Updates.fetchUpdateAsync();
    if (!isNew) return;
    offered = true;
    showDialog(
      'Corridor has been updated',
      'Restart now to use the new version, or carry on and it will be there next time you open the app.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart', onPress: () => Updates.reloadAsync() },
      ],
      'check'
    );
  } catch {
    // Offline, or EAS unreachable. The app carries on with what it has.
  } finally {
    busy = false;
  }
}

/** Mounted once at the root. */
export function useOtaUpdates() {
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);
}

/** True if version a is older than version b. */
function older(a: string, b: string): boolean {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
}

function openStore() {
  if (Platform.OS === 'ios') Linking.openURL(APP_STORE).catch(() => {});
  else Linking.openURL(STORE).catch(() => Linking.openURL(STORE_WEB).catch(() => {}));
}

let storeChecked = false;

async function offerStoreUpdate() {
  if (__DEV__ || !Updates.isEnabled || storeChecked) return;
  storeChecked = true;
  try {
    const asked = Number(await SecureStore.getItemAsync(STORE_ASKED_KEY));
    if (Date.now() - asked < STORE_ASK_EVERY_MS) return;
    const stamp = () => SecureStore.setItemAsync(STORE_ASKED_KEY, String(Date.now()));

    if (PlayUpdate) {
      if (await PlayUpdate.promptIfAvailable()) await stamp();
      return;
    }
    const newest = Platform.OS === 'ios' ? NEWEST_IN_STORE.ios : NEWEST_IN_STORE.android;
    const running = Updates.runtimeVersion;
    if (!newest || !running || !older(running, newest)) return;
    await stamp();
    showDialog(
      'Update Corridor',
      `A new version is ready. Update from the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'} to keep getting new features.`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Update', onPress: openStore },
      ],
      'alert'
    );
  } catch {
    // Asked again next time the app opens.
  }
}

/** Mounted once, inside the store, so it can wait until no ride is going on. */
export function StoreUpdates() {
  const riding = Boolean(useSharingRide());
  useEffect(() => {
    if (!riding) offerStoreUpdate();
  }, [riding]);
  return null;
}

/** The same, as a component, for the root layout to drop in beside the dialog host. */
export function OtaUpdates() {
  useOtaUpdates();
  return null;
}
