import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { applyScheme, color, currentScheme, type Scheme } from './tokens';

/**
 * Light, dark, or whatever the phone is set to.
 *
 * The choice is kept on the phone (it is a preference about this screen, not
 * about the person) and read once at launch. Until it is read the app follows
 * the phone, which is also the default.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'corridor.theme';

type ThemeState = {
  mode: ThemeMode;
  scheme: Scheme;
  setMode: (mode: ThemeMode) => void;
};

const Ctx = createContext<ThemeState | null>(null);

/**
 * Where to put the person back after the screens are rebuilt in the new
 * scheme. Switching from Account would otherwise land them on the map.
 */
let returnTo: { path: string; at: number } | null = null;

/**
 * Read once by the home screen as it mounts. Only a switch made a moment ago
 * counts: if the choice did not change the scheme, nothing was rebuilt, and a
 * stale request must not move someone later on.
 */
export function takeReturnTo(): string | null {
  const r = returnTo;
  returnTo = null;
  return r && Date.now() - r.at < 3000 ? r.path : null;
}

/** Whether a rebuild is about to send someone back, without using it up. */
export function peekReturnTo(): boolean {
  return returnTo !== null && Date.now() - returnTo.at < 3000;
}

/**
 * True for a moment after a theme switch. The trip back to the page it was
 * made from is instant then, so the rebuild reads as a recolour rather than a
 * page sliding in again.
 */
let switchedAt = 0;
export function justSwitchedTheme(): boolean {
  return Date.now() - switchedAt < 1500;
}

export function ThemeProvider({ children }: { children: (scheme: Scheme) => React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => {
        // No stored choice is the same as choosing the phone's.
      });
  }, []);

  const scheme: Scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  // The palette has to be right before anything below renders with it, so it
  // is switched here, during render, rather than in an effect a frame later.
  if (currentScheme() !== scheme) applyScheme(scheme);

  useEffect(() => {
    // Native pieces (alerts, the keyboard, the window behind the app) follow
    // the same choice. "unspecified" hands them back to the phone.
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(color.bg);
  }, [scheme]);

  const setMode = useCallback((next: ThemeMode) => {
    returnTo = { path: '/you', at: Date.now() };
    switchedAt = Date.now();
    setModeState(next);
    SecureStore.setItemAsync(KEY, next).catch(() => {
      // Lost on restart at worst; the switch itself still happened.
    });
  }, []);

  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);

  return <Ctx.Provider value={value}>{children(scheme)}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme is used outside ThemeProvider.');
  return v;
}
