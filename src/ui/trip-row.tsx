import { Pressable, StyleSheet, View } from 'react-native';

import { endName, seatsOpen, startName, useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { naira } from '@/lib/config';
import { distanceText } from '@/lib/nearby';
import { clock, untilText, type Minutes } from '@/lib/time';
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
  pickupM,
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
  /** Metres from the rider to where the ride starts, when known. */
  pickupM?: number;
}) {
  const { person } = useStore();
  const driver = person(trip.driverId);
  const open = seatsOpen(trip);
  const seats = open === 0 ? 'Full' : open === 1 ? '1 seat left' : `${open} seats left`;
  // Free or the flat contribution, on every card, so nobody books without knowing.
  const price = trip.contributionNaira ? naira(trip.contributionNaira) : 'Free';
  // The distance first, so a long place name never pushes it off the card.
  const from =
    pickupM === undefined
      ? `From ${startName(trip)}`
      : `Pickup ${distanceText(pickupM)} from you, at ${startName(trip)}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${driver.name.split(' ')[0]}, to ${endName(trip)}. ${from}. Leaves ${clock(trip.departMin)}, give or take ${trip.toleranceMin} minutes. ${seats}. ${trip.contributionNaira ? `${price} fuel contribution` : 'Free ride'}.`}
      style={({ pressed }) => [s.card, dim && s.dim, pressed && s.pressed]}>
      <View style={s.top}>
        <Avatar initials={driver.initials} size={48} />
        <View style={s.flex}>
          <Text variant="heading" numberOfLines={1} style={s.name}>
            {driver.name.split(' ')[0]}
          </Text>
          {/* Two lines, so a long start never pushes the destination off the card. */}
          <Text variant="small" tone="muted" numberOfLines={1}>
            To {endName(trip)}
          </Text>
          <Text variant="small" tone="faint" numberOfLines={1}>
            {from}
          </Text>
        </View>
        <View style={s.time}>
          <Text variant="dataLarge" tone={open === 0 ? 'faint' : 'ink'} style={s.timeText}>
            {clock(trip.departMin)}
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
        <View style={s.price}>
          <Text variant="small" tone={trip.contributionNaira ? 'ink' : 'muted'} style={s.seatsText}>
            {price}
          </Text>
        </View>
        <View style={[s.seats, open === 0 && s.seatsFull]}>
          <Text variant="small" tone={open === 0 ? 'faint' : 'accent'} style={s.seatsText}>
            {seats}
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
  price: {
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  seatsText: { fontWeight: '700', fontSize: 13 },
  })
);
