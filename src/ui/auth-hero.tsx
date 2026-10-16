import React from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { color, GUTTER, LIME, PINE, space, themed } from '@/theme/tokens';
import { RouteMark } from './icons';
import { useStatusBand } from './status-band';
import { Text } from './text';

/** The road across the hero: a pine band with a dashed lime line down it. */
const ROAD = 'M-20 236 C 70 196, 120 150, 210 128 S 330 70, 420 30';

/** The Route C mark and the word, as one lockup. On pine: lime route, white stop. */
export function Wordmark({ size = 34, tint = '#FFFFFF' }: { size?: number; tint?: string }) {
  return (
    <View style={s.lockup} accessibilityRole="image" accessibilityLabel="Corridor">
      <RouteMark size={size} road={LIME} ground={PINE} />
      <Text variant="title" style={[s.word, { color: tint, fontSize: size * 0.82, lineHeight: size }]}>
        corridor
      </Text>
    </View>
  );
}

/**
 * The sign in and work email layout: a pine hero with the lockup and the road
 * home drawn across it, then a light sheet holding the headline and the form.
 * The main action is pinned to the bottom, outside the scroll.
 */
export function AuthScreen({
  title,
  body,
  children,
  footer,
}: {
  title: string;
  body?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  useStatusBand(PINE);

  return (
    <SafeAreaView style={s.screen} edges={['left', 'right', 'bottom']}>
      {/*
        The keyboard pushes the form and the pinned button up rather than
        covering them. On a short phone the hero scrolls away above.
      */}
      <KeyboardAvoidingView style={s.flex} behavior="padding">
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.grow}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <View style={[s.hero, { height: Math.min(300, Math.round(height * 0.32)), paddingTop: insets.top + space.xl }]}>
            <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 260" preserveAspectRatio="xMidYMid slice">
              <Path d={ROAD} stroke="#24493A" strokeWidth="46" strokeLinecap="round" fill="none" />
              <Path d={ROAD} stroke={LIME} strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" fill="none" />
              <Circle cx="96" cy="196" r="6" fill="#FFFFFF" />
              <Circle cx="210" cy="128" r="17" fill={LIME} opacity="0.18" />
              <Circle cx="210" cy="128" r="9" fill={LIME} />
              <Circle cx="330" cy="72" r="6" fill="#FFFFFF" />
            </Svg>
            <Wordmark />
          </View>

          <View style={s.sheet}>
            <Text variant="display" style={s.headline}>
              {title}
            </Text>
            {body ? (
              <Text variant="body" tone="muted" style={s.body}>
                {body}
              </Text>
            ) : null}
            {children}
          </View>
        </ScrollView>
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    grow: { flexGrow: 1 },
    screen: { flex: 1, backgroundColor: color.bg },
    // Never more than a third of the screen, so a short phone keeps room for the form.
    hero: {
      backgroundColor: PINE,
      paddingHorizontal: GUTTER + space.sm,
      overflow: 'hidden',
    },
    lockup: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    word: { letterSpacing: -1 },
    sheet: {
      flex: 1,
      marginTop: -28,
      backgroundColor: color.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: GUTTER + space.sm,
      paddingTop: space.xxl,
      paddingBottom: space.xl,
    },
    headline: { marginBottom: space.sm },
    body: { marginBottom: space.xl },
    footer: {
      paddingHorizontal: GUTTER + space.sm,
      paddingTop: space.md,
      paddingBottom: space.md,
      backgroundColor: color.bg,
      gap: space.xs,
    },
  })
);
