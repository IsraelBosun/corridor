import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { useMyLocation } from '@/lib/location';
import { metresBetween } from '@/lib/mapbox';
import { useNow } from '@/lib/time';
import { space, themed } from '@/theme/tokens';
import { Button, Callout } from './primitives';
import { Text } from './text';

/** Close enough to the start, a rider's pickup or the destination to count as there. */
const AT_M = 150;
/** Far enough from the start, before Start ride, to have clearly set off. */
const SET_OFF_M = 500;

/*
  Prompts turned away with "Not now" stay away for the rest of the ride. Kept
  for as long as the app is open, which is as long as a ride needs.
*/
const dismissed = new Set<string>();

type Prompt = { key: string; text: string; action?: { label: string; run: () => void } };

/**
 * A quiet nudge to the car owner from where their phone is: at the pickup, set
 * off without starting, at a rider's pickup, at the destination. Shown on
 * screen only, never as a push, and each one at most once a ride. Nothing
 * shows without a position, so with location off the ride works as before.
 * Ending at the destination happens on its own (share_position); this only
 * says so.
 */
export function RidePrompt({ trip, onPickupScreen }: { trip: Trip; onPickupScreen?: boolean }) {
  const router = useRouter();
  const { me, person, markPresent } = useStore();
  const now = useNow();
  const [, redraw] = useState(0);
  const mine = trip.driverId === me?.id;
  const waiting = trip.status === 'posted' || trip.status === 'boarding';
  // From 30 minutes before the leaving time, as live sharing does.
  const active = mine && !trip.endedAt && (trip.status === 'left' || (waiting && now >= trip.departMin - 30));
  const here = useMyLocation(active);
  if (!active || !here) return null;

  const work = trip.direction === 'work';
  const toPickup = () => router.push({ pathname: '/pickup/[id]', params: { id: trip.id } });
  let prompt: Prompt | undefined;

  if (waiting && trip.origin) {
    const fromStart = metresBetween(here, trip.origin);
    if (fromStart >= SET_OFF_M && now >= trip.departMin - 10) {
      prompt = {
        key: 'set-off',
        text: 'Looks like you have set off. Start the ride so your riders know.',
        action: onPickupScreen ? undefined : { label: 'Start ride', run: toPickup },
      };
    } else if (!work && fromStart <= AT_M && now >= trip.departMin - 15 && trip.riders.length > 0) {
      prompt = {
        key: 'at-start',
        text: 'You are at the pickup. Tap Start ride when everyone is in.',
        action: onPickupScreen ? undefined : { label: 'Go to pickup', run: toPickup },
      };
    }
  } else if (trip.status === 'left') {
    const atEnd = trip.destination && metresBetween(here, trip.destination) <= AT_M;
    // To work: stopped near someone still to collect.
    const next = work
      ? trip.riders.find((r) => {
          const place = person(r).dropOff;
          return (
            !trip.presentAt[r] &&
            typeof place?.lat === 'number' &&
            typeof place?.lng === 'number' &&
            metresBetween(here, { lat: place.lat, lng: place.lng }) <= AT_M
          );
        })
      : undefined;
    if (next) {
      const name = person(next).name.split(' ')[0];
      prompt = {
        key: `picked-${next}`,
        text: `Is ${name} in?`,
        action: { label: 'Picked up', run: () => markPresent(trip.id, next) },
      };
    } else if (atEnd) {
      prompt = {
        key: 'at-end',
        text: 'You have arrived. The ride ends on its own in a few minutes, or tap End ride.',
      };
    }
  }

  if (!prompt || dismissed.has(`${trip.id}:${prompt.key}`)) return null;
  const id = `${trip.id}:${prompt.key}`;

  return (
    <Callout tone="go">
      <Text variant="body" style={s.bold}>
        {prompt.text}
      </Text>
      <View style={s.actions}>
        {prompt.action ? (
          <View style={s.flex}>
            <Button label={prompt.action.label} kind="go" onPress={prompt.action.run} />
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            dismissed.add(id);
            redraw((n) => n + 1);
          }}
          accessibilityRole="button"
          hitSlop={8}
          style={s.notNow}>
          <Text variant="small" tone="muted" style={s.bold}>
            Not now
          </Text>
        </Pressable>
      </View>
    </Callout>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '700' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
    notNow: { paddingVertical: space.sm },
  })
);
