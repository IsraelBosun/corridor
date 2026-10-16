import { useRouter } from 'expo-router';
import React from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarPalette, color, elevation, GUTTER, radius, space, themed } from '@/theme/tokens';
import { ArrowIcon, BackIcon, ChevronIcon, CloseIcon } from './icons';
import { Text } from './text';

export function Screen({
  children,
  scroll = true,
  footer,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /** Pinned to the bottom, outside the scroll area. Primary actions live here. */
  footer?: React.ReactNode;
}) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      {/* Edge to edge: the keyboard no longer shrinks the window, so make room for it here. */}
      <KeyboardAvoidingView style={s.flex} behavior="padding">
        <Body
          style={s.flex}
          contentContainerStyle={scroll ? s.scrollPad : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </Body>
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A standard app bar: back or close, then the screen title. */
export function ScreenHeader({
  eyebrow,
  title,
  onBack,
  icon = 'back',
}: {
  /** Older call sites pass the title under this name. */
  eyebrow?: string;
  title?: string;
  onBack?: () => void;
  /** A pushed screen goes back, a modal closes. */
  icon?: 'back' | 'close';
}) {
  const router = useRouter();

  /*
    Back has to mean something even when there is nothing behind it.

    router.back() throws "GO_BACK was not handled by any navigator" when the
    stack is one screen deep, which is the normal case for a link opened
    directly. Falling back to the home map is the honest answer.
  */
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <View style={s.header}>
      <Pressable
        hitSlop={12}
        onPress={onBack ?? goBack}
        accessibilityRole="button"
        accessibilityLabel={icon === 'close' ? 'Close' : 'Go back'}
        style={({ pressed }) => [s.headerButton, pressed && s.pressed]}>
        {icon === 'close' ? <CloseIcon /> : <BackIcon />}
      </Pressable>
      <Text variant="title" style={[s.flex, s.headerTitle]} numberOfLines={1}>
        {title ?? eyebrow ?? ''}
      </Text>
    </View>
  );
}

/** A round white button floating over the map. */
export function RoundButton({
  children,
  onPress,
  label,
  size = 44,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        s.round,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && s.pressed,
        style,
      ]}>
      {children}
    </Pressable>
  );
}

/** One line of a list: optional icon, text, optional value, a chevron when it goes somewhere. */
export function Row({
  icon,
  title,
  subtitle,
  value,
  onPress,
  tone = 'ink',
  last,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  tone?: 'ink' | 'stop';
  last?: boolean;
}) {
  const body = (
    <>
      {icon ? <View style={s.rowIcon}>{icon}</View> : null}
      <View style={s.flex}>
        <Text variant="body" tone={tone} style={s.rowTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" tone="muted" numberOfLines={1} style={s.rowValue}>
          {value}
        </Text>
      ) : null}
      {onPress ? <ChevronIcon /> : null}
    </>
  );
  const style = [s.row, !last && s.rowLine];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [style, pressed && s.pressed]}>
      {body}
    </Pressable>
  );
}

/** A quiet label above a group. */
export function SectionTitle({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.section, style]}>
      <Text variant="kicker" tone="muted">
        {children}
      </Text>
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  selected,
  tone = 'surface',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  selected?: boolean;
  tone?: 'surface' | 'sunken' | 'accent' | 'go' | 'stop';
}) {
  const toneStyle = {
    surface: { backgroundColor: color.surface, borderColor: color.line },
    sunken: { backgroundColor: color.sunken, borderColor: 'transparent' },
    accent: { backgroundColor: color.accentSoft, borderColor: 'transparent' },
    go: { backgroundColor: color.goSoft, borderColor: 'transparent' },
    stop: { backgroundColor: color.stopSoft, borderColor: 'transparent' },
  }[tone];

  const cardStyle = [s.card, toneStyle, selected && s.cardSelected, style];

  // The style has to land on the outermost element, or a pressable card in a
  // row loses its flex and collapses to content width.
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [cardStyle, pressed && s.pressed]}>
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  arrow,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'go' | 'danger';
  arrow?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const spec = {
    // Lime with pine text: the one loud thing on a screen.
    primary: { bg: color.accent, border: color.accent, tone: 'onAccent' as const },
    // Outlined in pine, for the action beside the main one.
    secondary: { bg: 'transparent', border: color.brand, tone: 'brand' as const },
    quiet: { bg: 'transparent', border: 'transparent', tone: 'ink' as const },
    go: { bg: color.go, border: color.go, tone: 'onInk' as const },
    danger: { bg: 'transparent', border: 'transparent', tone: 'stop' as const },
  }[kind];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.button,
        kind === 'quiet' || kind === 'danger' ? s.buttonSlim : null,
        { backgroundColor: spec.bg, borderColor: spec.border },
        disabled && s.disabled,
        pressed && !disabled && s.pressed,
        style,
      ]}>
      <Text variant="heading" tone={spec.tone}>
        {label}
      </Text>
      {arrow ? (
        <ArrowIcon
          size={18}
          tint={spec.tone === 'onAccent' ? color.onAccent : spec.tone === 'onInk' ? color.onInk : color.brandInk}
        />
      ) : null}
    </Pressable>
  );
}

/** Initials on a rounded square. The only avatar the product has. */
export function Avatar({
  initials,
  tone = 'person',
  size = 52,
}: {
  initials: string;
  /** "person" gives each colleague their own colour, picked from their initials. */
  tone?: 'person' | 'sunken' | 'accent' | 'go' | 'ink' | 'me';
  size?: number;
}) {
  const palette = avatarPalette();
  const own = palette[hash(initials) % palette.length];
  const bg = {
    person: own.bg,
    sunken: color.sunken,
    accent: color.accentSoft,
    go: color.goSoft,
    ink: color.brand,
    // Your own initials: lime, the way the top of every screen shows you.
    me: color.accent,
  }[tone];
  const ink = {
    person: own.fg,
    sunken: color.inkMuted,
    accent: color.accentInk,
    go: color.go,
    ink: color.onInk,
    me: color.onAccent,
  }[tone];
  return (
    <View
      style={[s.avatar, { width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: bg }]}>
      <Text
        variant="heading"
        style={{ color: ink, fontSize: size * 0.34, lineHeight: size * 0.44, fontWeight: '800' }}>
        {initials}
      </Text>
    </View>
  );
}

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** A tinted panel for a warning or a confirmation. */
export function Callout({
  icon,
  children,
  tone = 'sunken',
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'sunken' | 'stop' | 'go';
}) {
  return (
    <Card tone={tone} style={s.callout}>
      {icon ? <View style={s.calloutIcon}>{icon}</View> : null}
      <View style={s.flex}>{children}</View>
    </Card>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[s.divider, style]} />;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <View style={s.field}>
      <Text variant="eyebrow" tone="muted" style={s.fieldLabel}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="small" tone="muted" style={s.fieldHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A segmented control: equal parts on a sunken track, the chosen one lifted
 * onto a white tile. Seats, tolerances, that kind of thing.
 */
export function TileRow<T extends string | number>({
  options,
  value,
  onChange,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <View style={s.tileRow}>
      {options.map((opt) => {
        const on = opt === value;
        return (
          <Pressable
            key={String(opt)}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.tile, on && s.tileOn, pressed && s.pressed]}>
            <Text variant="data" tone={on ? 'ink' : 'muted'}>
              {render ? render(opt) : String(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.bg },
  scrollPad: { paddingHorizontal: GUTTER, paddingBottom: space.xxl },
  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: space.md,
    paddingBottom: space.md,
    backgroundColor: color.bg,
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 26, lineHeight: 31 },
  round: {
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: color.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontWeight: '500' },
  rowValue: { maxWidth: '45%' },
  section: { paddingTop: space.xl, paddingBottom: space.sm },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.lg,
  },
  cardSelected: { borderColor: color.brand, borderWidth: 2, backgroundColor: color.brandSoft },
  pressed: { opacity: 0.6 },
  button: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  buttonSlim: { minHeight: 44 },
  disabled: { opacity: 0.35 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  callout: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  calloutIcon: { paddingTop: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginVertical: space.lg,
  },
  field: { marginBottom: space.xl },
  fieldLabel: { marginBottom: space.sm },
  fieldHint: { marginTop: space.sm },
  tileRow: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.lg,
    backgroundColor: color.sunken,
  },
  tile: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOn: {
    backgroundColor: color.surface,
    shadowColor: color.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  })
);
