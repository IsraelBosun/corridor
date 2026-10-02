import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, GUTTER, space, themed } from '@/theme/tokens';

const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

/**
 * The panel over the bottom of the map, as in every ride hailing app.
 *
 * Two resting heights: collapsed, where the map still gets most of the screen,
 * and expanded, for reading a long list. It is dragged by its top edge, the
 * handle and the header, so the list inside scrolls normally and never fights
 * the drag.
 *
 * It moves by translation rather than by changing height, so nothing is laid
 * out again while it moves. The list is padded by the hidden amount, which is
 * what lets the last row still be scrolled into view while collapsed.
 */
export function BottomSheet({
  collapsed,
  expanded,
  header,
  children,
}: {
  /** Visible height at rest, in points. The map is padded by the same amount. */
  collapsed: number;
  /** Visible height when pulled up. */
  expanded: number;
  /** Pinned at the top of the sheet and used as the drag handle. */
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const travel = Math.max(0, expanded - collapsed);

  // 0 is fully up, travel is resting collapsed.
  const offset = useSharedValue(travel);
  const start = useSharedValue(travel);

  const drag = Gesture.Pan()
    .onStart(() => {
      start.value = offset.value;
    })
    .onChange((e) => {
      const next = start.value + e.translationY;
      // A little give past either end, the way native sheets feel.
      offset.value = next < 0 ? next / 4 : next > travel ? travel + (next - travel) / 4 : next;
    })
    .onEnd((e) => {
      const projected = offset.value + e.velocityY * 0.15;
      offset.value = withSpring(projected < travel / 2 ? 0 : travel, SPRING);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <Animated.View style={[s.sheet, { height: expanded }, sheetStyle]}>
      <GestureDetector gesture={drag}>
        <View style={s.top}>
          <View style={s.handle} />
          {header ? <View style={s.header}>{header}</View> : null}
        </View>
      </GestureDetector>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.body, { paddingBottom: travel + insets.bottom + space.xl }]}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: color.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    elevation: 16,
  },
  top: { paddingTop: space.sm, paddingHorizontal: GUTTER },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.lineStrong,
    marginBottom: space.md,
  },
  header: { paddingBottom: space.md },
  body: { paddingHorizontal: GUTTER },
  })
);
