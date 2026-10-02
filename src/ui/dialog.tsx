import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, CarIcon, CheckIcon, PersonIcon, ShieldIcon } from './icons';
import { Text } from './text';

/**
 * The app's own confirm dialog, in place of the phone's grey system alert.
 *
 * Same shape as Alert.alert, so a call site changes one word: a title, a line,
 * and buttons with 'cancel' or 'destructive' styles. It rises from the bottom
 * as a sheet, where a thumb already is, with the main action biggest.
 */
export type DialogAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
};

export type DialogIcon = 'car' | 'person' | 'shield' | 'alert' | 'check' | 'signout';

type DialogSpec = {
  title: string;
  message?: string;
  icon?: DialogIcon;
  actions: DialogAction[];
};

let show: ((spec: DialogSpec) => void) | null = null;

/** Opens the dialog. Needs <DialogHost /> mounted once near the root. */
export function showDialog(title: string, message: string | undefined, actions: DialogAction[], icon?: DialogIcon) {
  if (show) show({ title, message, actions, icon });
}

const DURATION = 240;

export function DialogHost() {
  const [spec, setSpec] = useState<DialogSpec | null>(null);
  const insets = useSafeAreaInsets();
  const shown = useSharedValue(0);

  useEffect(() => {
    show = (next) => {
      setSpec(next);
      shown.value = 0;
      shown.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) });
    };
    return () => {
      show = null;
    };
  }, [shown]);

  function close(then?: DialogAction) {
    shown.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(finish)(then);
    });
  }

  function finish(then?: DialogAction) {
    setSpec(null);
    then?.onPress?.();
  }

  const cancel = spec?.actions.find((a) => a.style === 'cancel');

  const backdrop = useAnimatedStyle(() => ({ opacity: shown.value }));
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * 360 }],
    opacity: 0.4 + shown.value * 0.6,
  }));

  if (!spec) return null;

  const main = spec.actions.filter((a) => a.style !== 'cancel');
  const danger = main.some((a) => a.style === 'destructive');
  const icon = spec.icon ?? (danger ? 'alert' : undefined);

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={() => close(cancel)}>
      <Animated.View style={[s.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(cancel)} accessibilityLabel="Close" />
      </Animated.View>

      <View style={s.wrap} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + space.lg }, sheet]}>
          <View style={s.grabber} />

          {icon ? (
            <View style={[s.icon, danger ? s.iconStop : null]}>
              <Glyph icon={icon} danger={danger} />
            </View>
          ) : null}

          <Text variant="title" style={s.title}>
            {spec.title}
          </Text>
          {spec.message ? (
            <Text variant="body" tone="muted" style={s.message}>
              {spec.message}
            </Text>
          ) : null}

          <View style={s.actions}>
            {main.map((a) => (
              <Pressable
                key={a.text}
                onPress={() => close(a)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  s.button,
                  a.style === 'destructive' ? s.buttonStop : s.buttonBrand,
                  pressed && s.pressed,
                ]}>
                <Text variant="body" tone={a.style === 'destructive' ? undefined : 'onInk'} style={[s.buttonText, a.style === 'destructive' && s.onStop]}>
                  {a.text}
                </Text>
              </Pressable>
            ))}
            {cancel ? (
              <Pressable
                onPress={() => close(cancel)}
                accessibilityRole="button"
                style={({ pressed }) => [s.button, s.buttonQuiet, pressed && s.pressed]}>
                <Text variant="body" style={s.buttonText}>
                  {cancel.text}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Glyph({ icon, danger }: { icon: DialogIcon; danger: boolean }) {
  const tint = danger ? color.stop : color.brandInk;
  switch (icon) {
    case 'car':
      return <CarIcon size={26} tint={tint} />;
    case 'person':
      return <PersonIcon size={26} tint={tint} />;
    case 'shield':
      return <ShieldIcon size={26} tint={tint} />;
    case 'check':
      return <CheckIcon size={26} tint={tint} />;
    case 'signout':
    case 'alert':
    default:
      return <AlertIcon size={26} tint={tint} />;
  }
}

const s = themed(() =>
  StyleSheet.create({
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 20, 24, 0.55)' },
    wrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: color.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: space.xl,
      paddingTop: space.md,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -6 },
      elevation: 24,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: color.line,
      marginBottom: space.xl,
    },
    icon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: color.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.lg,
    },
    iconStop: { backgroundColor: color.stopSoft },
    title: { marginBottom: space.sm },
    message: { marginBottom: space.sm },
    actions: { marginTop: space.xl, gap: space.sm },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.lg,
      borderRadius: radius.pill,
    },
    buttonBrand: { backgroundColor: color.brand },
    buttonStop: { backgroundColor: color.stop },
    buttonQuiet: { backgroundColor: color.sunken },
    buttonText: { fontWeight: '700' },
    onStop: { color: '#FFFFFF' },
    pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  })
);
