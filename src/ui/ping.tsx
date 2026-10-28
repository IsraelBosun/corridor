import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { backend } from '@/data/backend';
import { useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { clock, useNow } from '@/lib/time';
import { color, radius, space, themed } from '@/theme/tokens';
import { Text } from '@/ui/text';

/**
 * Let riders know. One tap sends a ready-made line to the ride chat, and the
 * chat's push carries the words to everyone booked, so the car owner does not
 * type while getting ready to leave.
 *
 * These exact lines are listed in the database too (migration
 * 20261027130000_ride_pings.sql), which puts them in the push itself rather
 * than "Message from ...". Change both together.
 */
export const PINGS = {
  ten: 'Leaving in 10 minutes',
  five: 'Leaving in 5 minutes',
  there: 'I am at the pickup now',
  late: 'Running about 10 minutes late',
} as const;

/** From this long before the leaving time. Earlier than that it is noise. */
const OPENS_MS = 30 * 60_000;
/** Between pings on one ride, so a stray tap does not buzz everyone twice. */
const GAP_MS = 2 * 60_000;

// Kept outside the component, so leaving the screen and coming back does not
// reset the wait.
const lastSent = new Map<string, { at: number; text: string }>();

export function PingRiders({ trip }: { trip: Trip }) {
  const { me } = useStore();
  // Ticks, so the card appears by itself when the 30 minutes start.
  useNow();
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const work = trip.direction === 'work';
  const waiting = trip.riders.filter((r) => !trip.presentAt[r]);
  // Nobody to tell, too early, or (to work, once moving) everyone is in.
  if (!me || trip.riders.length === 0) return null;
  if (trip.status === 'left' ? !work || waiting.length === 0 : Date.now() < trip.departAt - OPENS_MS) return null;

  const options: string[] =
    trip.status === 'left'
      ? [PINGS.late]
      : work
        ? [PINGS.ten, PINGS.five, PINGS.late]
        : [PINGS.ten, PINGS.five, PINGS.there, PINGS.late];

  const last = lastSent.get(trip.id);
  const resting = !!last && Date.now() - last.at < GAP_MS;

  async function send(text: string) {
    if (!me || busy || resting) return;
    setBusy(true);
    setError(null);
    try {
      await backend.sendMessage(trip.id, me.id, text);
      lastSent.set(trip.id, { at: Date.now(), text });
      // Lift the wait on its own when it is over.
      setTimeout(() => setTick((n) => n + 1), GAP_MS);
    } catch {
      setError('That did not send. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.card}>
      <Text variant="body" style={s.bold}>
        Let riders know
      </Text>
      <Text variant="small" tone="muted">
        {trip.riders.length === 1 ? 'Your rider gets' : `All ${trip.riders.length} riders get`} a notification, and it
        shows in the ride chat.
      </Text>
      <View style={s.chips}>
        {options.map((text) => (
          <Pressable
            key={text}
            onPress={() => send(text)}
            disabled={busy || resting}
            accessibilityRole="button"
            style={({ pressed }) => [s.chip, (busy || resting) && s.off, pressed && s.pressed]}>
            <Text variant="small" style={s.chipText}>
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text variant="small" tone="stop">
          {error}
        </Text>
      ) : last ? (
        <Text variant="small" tone="go">
          Sent &quot;{last.text}&quot; at {clock(new Date(last.at).getHours() * 60 + new Date(last.at).getMinutes())}
          {resting ? '. You can send another in a couple of minutes.' : '.'}
        </Text>
      ) : null}
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
  },
  bold: { fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.brand,
  },
  chipText: { fontWeight: '700', color: color.brandInk },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  })
);
