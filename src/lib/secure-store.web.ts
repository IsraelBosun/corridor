/**
 * expo-secure-store for the web build, which ships no implementation of its
 * own. metro.config.js swaps this in on web only; phones keep the real
 * keychain.
 *
 * Browser storage is not secure storage. That is acceptable for web as a
 * development preview, and it is the reason the web build is not offered to
 * anyone as the app.
 */
export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function isAvailableAsync(): Promise<boolean> {
  return store() !== null;
}

export async function getItemAsync(key: string): Promise<string | null> {
  return store()?.getItem(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store()?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store()?.removeItem(key);
}

export function getItem(key: string): string | null {
  return store()?.getItem(key) ?? null;
}

export function setItem(key: string, value: string): void {
  store()?.setItem(key, value);
}
