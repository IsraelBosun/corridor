import { Pressable, StyleSheet, View } from 'react-native';

import { seatsOpen, useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { hhmm, untilText, type Minutes } from '@/lib/time';
import { color, elevation, radius, space, themed } from '@/theme/tokens';
import { Avatar } from './primitives';
import { Text } from './text';

/**
 * One ride in the list, laid out like the options list in a ride hailing app:
 * who, when, how far, and seats left. Everything else is one tap away.
 */
export function TripRow({
  trip,
  now,
  onPress,
  dim,
}: {
  trip: Trip;
  now: Minutes;
  onPress: () => void;
  /** Rides that do not pass your stop are listed, but quieter. */
  dim?: boolean;
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
        <Avatar initials={driver.initials} size={44} />
        <View style={s.flex}>
          <Text variant="heading" numberOfLines={1}>
            {driver.name}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            To {trip.destination?.name ?? last.name}
          </Text>
        </View>
        <View style={s.time}>
          <Text variant="dataLarge" tone={open === 0 ? 'faint' : 'brand'}>
            {hhmm(trip.departMin)}
          </Text>
          <Text variant="small" tone="muted" style={s.tolerance}>
            ±{trip.toleranceMin} min
          </Text>
        </View>
      </View>
      <View style={s.bottom}>
        <View style={s.when}>
          <View style={s.whenDot} />
          <Text variant="small" tone="brand" style={s.bold}>
            {untilText(trip.departMin, now)}
          </Text>
        </View>
        <View style={[s.seats, open === 0 && s.seatsFull]}>
          <Text variant="small" tone={open === 0 ? 'faint' : 'go'} style={s.bold}>
            {open === 0 ? 'Full' : open === 1 ? '1 seat left' : `${open} seats left`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    gap: space.md,
    borderWidth: 1,
    borderColor: color.line,
    ...elevation,
    shadowOpacity: 0.06,
    elevation: 1,
  },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  time: { alignItems: 'flex-end' },
  tolerance: { fontSize: 12, lineHeight: 15 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  when: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  whenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.brand },
  bold: { fontWeight: '700', fontSize: 13 },
  seats: {
    backgroundColor: color.goSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seatsFull: { backgroundColor: color.sunken },
  })
);
