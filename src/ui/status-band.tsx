import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, themed } from '@/theme/tokens';

/*
  The band's colour. Most screens sit under the night strip; a screen whose
  top is a pine header asks for pine while it is in front, so the clock reads
  as part of that header rather than a dark stripe above it.
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

/**
 * Paints the strip behind the clock and battery. Under edge to edge that strip
 * is see-through, and whatever happens to be behind it (often nothing, which
 * shows as black) would show instead.
 *
 * The root layout draws one over every screen. A Modal is its own window on
 * Android and sits above that, so it draws its own.
 */
export function StatusBand({ tint }: { tint?: string }) {
  const insets = useSafeAreaInsets();
  const asked = useSyncExternalStore(subscribe, () => current);
  return (
    <View
      pointerEvents="none"
      style={[s.band, { height: insets.top }, { backgroundColor: tint ?? asked ?? color.brandDeep }]}
    />
  );
}

const s = themed(() =>
  StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0 },
  })
);
