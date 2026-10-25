import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { usePlans, type Plan } from '@/data/plans';
import { directionWords, useStore } from '@/data/store';
import type { Destination } from '@/data/types';
import { EVENING_END_MIN, EVENING_START_MIN, MORNING_END_MIN, MORNING_START_MIN } from '@/lib/config';
import type { Place } from '@/lib/places';
import { clock, hhmm } from '@/lib/time';
import { color, radius, space, themed } from '@/theme/tokens';
import { DayPicker } from '@/ui/day-picker';
import { showDialog } from '@/ui/dialog';
import { AlertIcon, ChevronIcon } from '@/ui/icons';
import { PlaceSearch } from '@/ui/place-search';
import { Button, Callout, Field, Screen, ScreenHeader, TileRow } from '@/ui/primitives';
import { StatusBand } from '@/ui/status-band';
import { Text } from '@/ui/text';
import { TimePicker } from '@/ui/time-picker';

const TOLERANCES = [15, 30, 45] as const;
const SEATS = [1, 2, 3, 4] as const;

/**
 * One regular ride, from Account: its days, time, route and seats, paused or
 * running, or deleted. Changes are for the days ahead. A ride it has already
 * posted today keeps its own details, and is changed on its own.
 */
export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useStore();
  const { plans, loading, failed, reload, update, setActive, remove } = usePlans(me?.id);
  const plan = plans.find((p) => p.id === id);

  if (!plan) {
    return (
      <Screen>
        <ScreenHeader title="Weekly ride" />
        {loading ? (
          <Text variant="body" tone="muted">
            Loading
          </Text>
        ) : failed ? (
          <Pressable onPress={reload} accessibilityRole="button">
            <Text variant="body" tone="muted">
              Could not load this weekly ride. Tap to try again.
            </Text>
          </Pressable>
        ) : (
          <Text variant="body" tone="muted">
            This weekly ride has been deleted.
          </Text>
        )}
      </Screen>
    );
  }

  return <PlanForm key={plan.id} plan={plan} update={update} setActive={setActive} remove={remove} />;
}

function PlanForm({
  plan,
  update,
  setActive,
  remove,
}: {
  plan: Plan;
  update: ReturnType<typeof usePlans>['update'];
  setActive: ReturnType<typeof usePlans>['setActive'];
  remove: ReturnType<typeof usePlans>['remove'];
}) {
  const router = useRouter();
  const { trips } = useStore();
  const work = plan.direction === 'work';
  const span = work
    ? { earliest: MORNING_START_MIN, latest: MORNING_END_MIN }
    : { earliest: EVENING_START_MIN, latest: EVENING_END_MIN };

  const [days, setDays] = useState(plan.weekdays);
  const [departMin, setDepartMin] = useState(plan.departMin);
  const [origin, setOrigin] = useState<Destination>(plan.origin);
  const [destination, setDestination] = useState<Destination | undefined>(plan.destination);
  const [seats, setSeats] = useState(plan.seatsTotal);
  const [toleranceMin, setToleranceMin] = useState(plan.toleranceMin);
  const [running, setRunning] = useState(plan.active);
  const [searching, setSearching] = useState<'from' | 'to' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The ride this plan has already posted today, if it is still to leave.
  const today = trips.find(
    (t) => t.planId === plan.id && (t.status === 'posted' || t.status === 'boarding') && t.departAt > Date.now()
  );

  const sameDays = [...days].sort().join() === [...plan.weekdays].sort().join();
  const changed =
    !sameDays ||
    departMin !== plan.departMin ||
    origin.name !== plan.origin.name ||
    destination?.name !== plan.destination?.name ||
    seats !== plan.seatsTotal ||
    toleranceMin !== plan.toleranceMin ||
    running !== plan.active;

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/you');
  }

  function pick(p: Place) {
    const place = { name: p.name, lat: p.lat, lng: p.lng };
    if (searching === 'from') setOrigin(place);
    else setDestination(place);
    setSearching(null);
  }

  async function save() {
    if (!changed || saving || days.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await update(plan.id, {
        weekdays: [...days].sort((a, b) => a - b),
        depart_time: `${hhmm(departMin)}:00`,
        tolerance_min: toleranceMin,
        seats_total: seats,
        origin_name: origin.name,
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        destination_name: destination?.name ?? null,
        destination_lat: destination?.lat ?? null,
        destination_lng: destination?.lng ?? null,
      });
      if (running !== plan.active) await setActive(plan.id, running);
      close();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
      setSaving(false);
    }
  }

  function confirmDelete() {
    showDialog(
      'Delete this weekly ride?',
      'No more rides are posted from it. A ride it already posted today stays, and you can cancel that one on its own.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await remove(plan.id);
            close();
          },
        },
      ]
    );
  }

  return (
    <Screen
      footer={
        <>
          {error ? (
            <Callout tone="stop" icon={<AlertIcon />}>
              <Text variant="small" tone="muted">
                {error}
              </Text>
            </Callout>
          ) : null}
          <Button
            label={saving ? 'Saving' : 'Save changes'}
            onPress={save}
            disabled={saving || !changed || days.length === 0}
          />
          <Button label="Delete weekly ride" kind="danger" disabled={saving} onPress={confirmDelete} />
        </>
      }>
      <ScreenHeader title={`Weekly ride ${directionWords(plan.direction)}`} />

      {today ? (
        <Callout>
          <Text variant="small" tone="muted">
            Today&apos;s ride is already posted for {clock(today.departMin)}. Changes here start from the
            next day it runs.
          </Text>
          <Button
            label="Edit today's ride"
            kind="secondary"
            onPress={() => router.push({ pathname: '/post', params: { id: today.id } })}
          />
        </Callout>
      ) : null}

      <Field label="Days" hint={days.length === 0 ? 'Pick at least one day.' : undefined}>
        <DayPicker value={days} onChange={setDays} />
      </Field>

      <Field label="Leaving around">
        <TimePicker value={departMin} onChange={setDepartMin} earliest={span.earliest} latest={span.latest} />
      </Field>

      <Field label="Starting from">
        <Pressable
          onPress={() => setSearching('from')}
          accessibilityRole="button"
          style={({ pressed }) => [s.row, pressed && s.pressed]}>
          <Text variant="body" style={s.flex}>
            {origin.name}
          </Text>
          <ChevronIcon tint={color.inkMuted} />
        </Pressable>
      </Field>

      <Field label="Heading to">
        <Pressable
          onPress={() => setSearching('to')}
          accessibilityRole="button"
          style={({ pressed }) => [s.row, pressed && s.pressed]}>
          <Text variant="body" tone={destination ? 'ink' : 'faint'} style={s.flex}>
            {destination?.name ?? 'Search where you are going'}
          </Text>
          <ChevronIcon tint={color.inkMuted} />
        </Pressable>
      </Field>

      <Field label="Seats">
        <TileRow options={SEATS} value={seats} onChange={setSeats} />
      </Field>

      <Field label="Give or take">
        <TileRow options={TOLERANCES} value={toleranceMin} onChange={setToleranceMin} render={(v) => `${v} min`} />
      </Field>

      <Field
        label="Posting"
        hint={running ? 'Posted for you on each day picked.' : 'Paused. Nothing is posted until you turn it back on.'}>
        <TileRow
          options={['on', 'paused'] as const}
          value={running ? 'on' : 'paused'}
          onChange={(v) => setRunning(v === 'on')}
          render={(v) => (v === 'on' ? 'On' : 'Paused')}
        />
      </Field>

      <Modal
        visible={searching !== null}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSearching(null)}>
        {searching === 'from' ? (
          <PlaceSearch
            placeholder="Where do you start from?"
            intro={
              work
                ? 'Type your estate, a junction or a street near home. Not your house number.'
                : 'Type where riders should meet you: a building, a gate, a car park or a street.'
            }
            current={origin.name}
            onBack={() => setSearching(null)}
            onPick={pick}
            privacy="Riders on your ride see where you start."
            offerHere
          />
        ) : (
          <PlaceSearch
            placeholder="Where are you going?"
            intro={
              work
                ? 'Type where you work: the building, the gate or the car park.'
                : 'Type where you are heading: an estate, a bus stop, a mall or a street.'
            }
            current={destination?.name}
            onBack={() => setSearching(null)}
            onPick={pick}
            privacy="Riders on your ride see where you are going."
          />
        )}
        <StatusBand />
      </Modal>
    </Screen>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: color.surface,
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: radius.lg,
      paddingHorizontal: space.lg,
      paddingVertical: 14,
    },
    pressed: { opacity: 0.6 },
  })
);
