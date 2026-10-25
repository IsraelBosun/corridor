import { Pressable, StyleSheet, View } from 'react-native';

import { color, LIME, PINE, radius, space, themed } from '@/theme/tokens';
import { Text } from './text';

/** ISO weekdays, Monday first. */
const DAYS = [
  { n: 1, short: 'M', name: 'Monday' },
  { n: 2, short: 'T', name: 'Tuesday' },
  { n: 3, short: 'W', name: 'Wednesday' },
  { n: 4, short: 'T', name: 'Thursday' },
  { n: 5, short: 'F', name: 'Friday' },
  { n: 6, short: 'S', name: 'Saturday' },
  { n: 7, short: 'S', name: 'Sunday' },
] as const;

/**
 * The days a regular ride runs. `clearLabel` names the shortcut back to no
 * days at all ("Just today" on a new ride); without it, the shortcut only
 * ever picks every weekday.
 */
export function DayPicker({
  value,
  onChange,
  clearLabel,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  clearLabel?: string;
}) {
  const weekdays = value.length === 5 && [1, 2, 3, 4, 5].every((n) => value.includes(n));
  const shortcut = weekdays ? (clearLabel ?? null) : 'Every weekday';
  return (
    <View style={s.days}>
      <View style={s.dayRow}>
        {DAYS.map((d) => {
          const on = value.includes(d.n);
          return (
            <Pressable
              key={d.n}
              onPress={() => onChange(on ? value.filter((n) => n !== d.n) : [...value, d.n])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={d.name}
              style={({ pressed }) => [s.day, on && s.dayOn, pressed && s.pressed]}>
              <Text variant="data" style={on ? s.dayTextOn : s.dayText}>
                {d.short}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {shortcut ? (
        <Pressable onPress={() => onChange(weekdays ? [] : [1, 2, 3, 4, 5])} accessibilityRole="button" hitSlop={6}>
          <Text variant="small" tone="brand" style={s.link}>
            {shortcut}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
    days: { gap: space.sm },
    dayRow: { flexDirection: 'row', gap: 6 },
    day: {
      flex: 1,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: color.line,
      backgroundColor: color.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayOn: { backgroundColor: PINE, borderColor: PINE },
    dayText: { color: color.inkMuted },
    dayTextOn: { color: LIME },
    pressed: { opacity: 0.6 },
    link: { fontWeight: '600' },
  })
);
