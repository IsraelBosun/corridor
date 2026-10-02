import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { currentScheme, space, themed } from '@/theme/tokens';
import { Text } from './text';

/**
 * The top of the sign in and work email screens: the wordmark, a headline and
 * one quiet line. Nothing else, so the form is the first thing the eye lands on.
 */
export function AuthHero({ title, body }: { title: string; body?: string }) {
  const wordmark =
    currentScheme() === 'dark'
      ? require('../../assets/images/wordmark-light.png')
      : require('../../assets/images/wordmark.png');
  return (
    <View style={s.hero}>
      <Image source={wordmark} style={s.wordmark} contentFit="contain" accessibilityLabel="Corridor" />
      <Text variant="display" style={s.headline}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted">
          {body}
        </Text>
      ) : null}
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
    hero: { marginTop: space.huge, marginBottom: space.xxl },
    wordmark: { width: 120, height: 24, marginBottom: space.huge },
    headline: { marginBottom: space.sm },
  })
);
