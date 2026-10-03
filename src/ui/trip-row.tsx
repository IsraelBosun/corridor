import { Pressable, StyleSheet, View } from 'react-native';

import { seatsOpen, useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { hhmm, untilText, type Minutes } from '@/lib/time';
import { color, elevation, radius, space, themed } from '@/theme/tokens';
import { ClockIcon } from './icons';
import { Avatar, Button } from './primitives';
import { Text } from './text';

/** "Leaves in about 2 hr", "Leaving now", "Was due at 18:30". */
export function leavesText(target: Minutes, now: Minutes): string {
  const t = untilText(target, now);
  return t.startsWith('in ') ? `Leaves ${t}` : t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * One ride in the list: who, where they are heading, when, and seats left.
 * The car is not shown here. Only riders with a seat see it.
 */
export function TripRow({
  trip,
  now,
  onPress,
  dim,
  cta,
}: {
  trip: Trip;
  now: Minutes;
  onPress: () => void;
  /** Rides that do not pass your stop are listed, but quieter. */
  dim?: boolean;
  /**
   * Label for a full width button under the card. It opens the ride, where the
   * seat is taken after the safety note, so it never books from the list.
   */
  cta?: string;
}) {
  const { person, landmark } = useStore();
  const driver = person(trip.driverId);
  const open = seatsOpen(trip);
  const last = landmark(trip.stops[trip.stops.length - 1]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.card, dim && s.dim, pressed && s.pressed]}>
      <View style={s.top}>
        <Avatar initials={driver.initials} size={48} />
        <View style={s.flex}>
          <Text variant="heading" numberOfLines={1} style={s.name}>
            {driver.name.split(' ')[0]}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            To {trip.destination?.name ?? last.name}
          </Text>
        </View>
        <View style={s.time}>
          <Text variant="dataLarge" tone={open === 0 ? 'faint' : 'ink'} style={s.timeText}>
            {hhmm(trip.departMin)}
          </Text>
          <Text variant="small" tone="muted" style={s.tolerance}>
            ±{trip.toleranceMin} min
          </Text>
        </View>
      </View>

      <View style={s.strip}>
        <ClockIcon size={16} tint={color.brandInk} />
        <Text variant="small" style={[s.flex, s.bold]} numberOfLines={1}>
          {leavesText(trip.departMin, now)}
        </Text>
        <View style={[s.seats, open === 0 && s.seatsFull]}>
          <Text variant="small" tone={open === 0 ? 'faint' : 'accent'} style={s.seatsText}>
            {open === 0 ? 'Full' : open === 1 ? '1 seat left' : `${open} seats left`}
          </Text>
        </View>
      </View>

      {cta && open > 0 ? <Button label={cta} onPress={onPress} /> : null}
    </Pressable>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    gap: space.md,
    ...elevation,
    shadowOpacity: 0.07,
    elevation: 2,
  },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 19, lineHeight: 24 },
  time: { alignItems: 'flex-end' },
  timeText: { fontSize: 28, lineHeight: 32 },
  tolerance: { fontSize: 12, lineHeight: 15 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.sunken,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  seats: {
    backgroundColor: color.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  seatsFull: { backgroundColor: color.surface },
  seatsText: { fontWeight: '700', fontSize: 13 },
  })
);
