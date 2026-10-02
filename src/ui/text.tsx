import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { color, font, fontByWeight, type Palette, type } from '@/theme/tokens';

type Variant = keyof typeof type;

type Props = TextProps & {
  variant?: Variant;
  /** Monospace. Opt in only, for codes read out character by character. */
  mono?: boolean;
  tone?: 'ink' | 'muted' | 'faint' | 'accent' | 'brand' | 'go' | 'stop' | 'onInk';
  center?: boolean;
};

// Palette keys, not colours: the palette changes with the theme, so the colour
// is looked up when the text is drawn.
const TONE: Record<NonNullable<Props['tone']>, keyof Palette> = {
  ink: 'ink',
  muted: 'inkMuted',
  faint: 'inkFaint',
  accent: 'accentInk',
  brand: 'brandInk',
  go: 'go',
  stop: 'stop',
  onInk: 'onInk',
};

export function Text({
  variant = 'body',
  mono,
  tone = 'ink',
  center,
  style,
  ...rest
}: Props) {
  const base = type[variant] as TextStyle;
  // Numbers line up in columns without switching to a monospace face.
  const isData = variant === 'data' || variant === 'dataLarge';

  // Archivo ships one file per weight, and Android only honours a weight by
  // its family name. Take whatever weight the styles settle on and swap in
  // that family, rather than letting Android fake a bold over the regular.
  const flat = StyleSheet.flatten([base, style]) ?? {};
  const family = mono ? font.mono : (fontByWeight[String(flat.fontWeight ?? '400')] ?? font.sans);

  return (
    <RNText
      {...rest}
      style={[
        base,
        {
          color: color[TONE[tone]],
          textAlign: center ? 'center' : undefined,
        },
        isData && { fontVariant: ['tabular-nums'] },
        style,
        { fontFamily: family, fontWeight: mono ? flat.fontWeight : 'normal' },
      ]}
    />
  );
}
