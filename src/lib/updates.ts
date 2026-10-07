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
 */
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { showDialog } from '@/ui/dialog';

const EVERY_MS = 30 * 60 * 1000;

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

/** The same, as a component, for the root layout to drop in beside the dialog host. */
export function OtaUpdates() {
  useOtaUpdates();
  return null;
}
