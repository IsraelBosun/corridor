import * as SecureStore from 'expo-secure-store';

/**
 * Whether this phone has seen the intro. Kept on the phone, not the account:
 * it is about a first open of the app, and it is shown once. Account has a
 * button to watch it again.
 */
const KEY = 'corridor.onboarded';

export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    // Unreadable storage: do not trap anyone in the intro on every launch.
    return true;
  }
}

export async function markOnboarded(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    // Seen again next launch at worst.
  }
}
