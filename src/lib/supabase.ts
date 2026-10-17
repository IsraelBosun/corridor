import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * False when the keys did not make it into the bundle.
 *
 * This used to throw here instead. Throwing during module evaluation meant the
 * root layout never finished importing, so expo-router got an undefined route
 * module and failed with "Cannot read property 'ErrorBoundary' of undefined".
 * The real cause was printed twenty lines earlier, above a wall of repeats.
 * A missing environment variable is a setup mistake, not a crash, and the app
 * should be able to say so on screen.
 */
export const isConfigured = Boolean(URL && ANON);

/**
 * Token storage.
 *
 * The refresh token is a login credential, so it belongs in the keychain rather
 * than in plain AsyncStorage. SecureStore refuses any single value over 2048
 * bytes, and a Supabase session can cross that once the JWT carries a few
 * claims. Rather than pull in a crypto library to encrypt into AsyncStorage,
 * this splits long values across numbered keys and stitches them back.
 */
const CHUNK = 1800;
const MARKER = '__chunks__:';

async function readChunkCount(key: string): Promise<number> {
  const head = await SecureStore.getItemAsync(key);
  if (head && head.startsWith(MARKER)) return parseInt(head.slice(MARKER.length), 10) || 0;
  return 0;
}

const secureAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith(MARKER)) return head;
    const count = parseInt(head.slice(MARKER.length), 10) || 0;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      parts.push((await SecureStore.getItemAsync(key + '.' + i)) ?? '');
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Clear whatever shape the previous value had before writing a new one,
    // or a short value would leave orphan chunks behind.
    const previous = await readChunkCount(key);
    for (let i = 0; i < previous; i++) await SecureStore.deleteItemAsync(key + '.' + i);

    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(key + '.' + i, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(key, MARKER + count);
  },

  async removeItem(key: string): Promise<void> {
    const count = await readChunkCount(key);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(key + '.' + i);
    await SecureStore.deleteItemAsync(key);
  },
};

/** SecureStore has no web implementation, and the web build is only ever a preview. */
const webAdapter = {
  getItem: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  setItem: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
  removeItem: async (k: string) => globalThis.localStorage?.removeItem(k),
};

// Placeholders keep createClient from throwing when the keys are missing. No
// request is ever made with them, because the app shows the setup screen
// instead of mounting anything that talks to the network.
export const supabase = createClient(URL ?? 'https://unconfigured.invalid', ANON ?? 'unconfigured', {
  // Everything this app owns lives in its own schema. The Supabase project is
  // shared with another application that already owns tables in public, so
  // "profiles" and "messages" are names we cannot have there. Setting it here
  // means every from() and rpc() call resolves into corridor without each
  // caller having to remember.
  db: { schema: 'corridor' },
  auth: {
    storage: Platform.OS === 'web' ? webAdapter : secureAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Web only, and this app is native. The one link that carries a session,
    // the sign-up confirmation, is read by AuthLink (lib/auth-link.tsx).
    detectSessionInUrl: false,
  },
});

/**
 * Supabase refreshes tokens on a timer, which a backgrounded app does not run.
 * Without this, coming back to the app after an evening in your pocket means a
 * stale token and a silent failure on the first request.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
