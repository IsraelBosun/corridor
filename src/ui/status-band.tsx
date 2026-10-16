import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, themed } from '@/theme/tokens';

/*
  The band's colour. Most screens sit under a strip the colour of the page; a
  screen whose top is a pine header asks for pine while it is in front, so the
  clock reads as part of that header rather than a stripe above it.
*/
let current: string | null = null;
let owner = 0;
const listeners = new Set<() => void>();

function setBand(next: string | null) {
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Colour the status band while this screen is focused. Leaving resets it, but
 * only if no other screen has claimed it since, because the next screen's
 * focus can land before this one's blur.
 */
export function useStatusBand(tint: string) {
  useFocusEffect(
    useCallback(() => {
      const me = ++owner;
      setBand(tint);
      return () => {
        if (owner === me) setBand(null);
      };
    }, [tint])
  );
}

/** True for a pale colour, which needs dark clock and battery icons on it. */
function isPale(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/**
 * Paints the strip behind the clock and battery, and picks icons that read on
 * it. Under edge to edge that strip is see-through, and whatever happens to be
 * behind it (often nothing, which shows as black) would show instead.
 *
 * The root layout draws one over every screen. A Modal is its own window on
 * Android and sits above that, so it draws its own.
 */
export function StatusBand({ tint }: { tint?: string }) {
  const insets = useSafeAreaInsets();
  const asked = useSyncExternalStore(subscribe, () => current);
  const band = tint ?? asked ?? color.brandDeep;
  return (
    <>
      <StatusBar style={isPale(band) ? 'dark' : 'light'} />
      <View pointerEvents="none" style={[s.band, { height: insets.top }, { backgroundColor: band }]} />
    </>
  );
}

const s = themed(() =>
  StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0 },
  })
);
