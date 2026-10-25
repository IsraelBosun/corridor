import { Pressable, StyleSheet, View } from 'react-native';

import { clock, type Minutes } from '@/lib/time';
import { LIME, PINE, radius, space, themed } from '@/theme/tokens';
import { Text } from './text';

/**
 * A leaving time, a quarter hour at a time, between `earliest` and `latest`.
 * Pine in both themes: on the screens that use it, the time is the one
 * number that matters. "7:30" large, "AM" beside it smaller, so a 12 hour
 * time still fits between the buttons on a narrow phone.
 */
export function TimePicker({
  value,
  onChange,
  earliest,
  latest,
}: {
  value: Minutes;
  onChange: (m: Minutes) => void;
  earliest: Minutes;
  latest: Minutes;
}) {
  const [time, half] = clock(value).split(' ');
  const atStart = value <= earliest;
  const atEnd = value >= latest;
  return (
    <View style={s.time}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fifteen minutes earlier"
        accessibilityState={{ disabled: atStart }}
        disabled={atStart}
        onPress={() => onChange(Math.max(earliest, value - 15))}
        style={({ pressed }) => [s.step, atStart && s.stepOff, pressed && s.pressed]}>
        <Text variant="title" style={s.stepMinus}>−</Text>
      </Pressable>
      <View style={s.value} accessible accessibilityLabel={`Leaving around ${clock(value)}`}>
        <Text variant="display" style={s.timeText}>
          {time}
        </Text>
        <Text variant="heading" style={s.half}>
          {half}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fifteen minutes later"
        accessibilityState={{ disabled: atEnd }}
        disabled={atEnd}
        onPress={() => onChange(Math.min(latest, value + 15))}
        style={({ pressed }) => [s.step, s.stepPlus, atEnd && s.stepOff, pressed && s.pressed]}>
        <Text variant="title" style={s.stepPlusText}>+</Text>
      </Pressable>
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
    time: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: PINE,
      borderRadius: radius.xl,
      padding: space.md,
    },
    value: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    timeText: { fontVariant: ['tabular-nums'], color: '#FFFFFF', fontSize: 44, lineHeight: 50 },
    half: { color: LIME },
    step: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      backgroundColor: '#24493A',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepMinus: { color: '#FFFFFF' },
    stepPlus: { backgroundColor: LIME },
    stepPlusText: { color: PINE },
    stepOff: { opacity: 0.35 },
    pressed: { opacity: 0.6 },
  })
);
