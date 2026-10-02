import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, themed } from '@/theme/tokens';

/**
 * Paints the strip behind the clock and battery in the brand colour. Under
 * edge to edge that strip is see-through, and whatever happens to be behind it
 * (often nothing, which shows as black) would show instead.
 *
 * The root layout draws one over every screen. A Modal is its own window on
 * Android and sits above that, so it draws its own.
 */
export function StatusBand() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={[s.band, { height: insets.top }]} />;
}

const s = themed(() =>
  StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: color.brandDeep },
  })
);
