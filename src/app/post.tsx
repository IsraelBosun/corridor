import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useStore } from '@/data/store';
import type { Destination } from '@/data/types';
import type { Place } from '@/lib/places';
import { EVENING_END_MIN, EVENING_START_MIN } from '@/lib/config';
import { hhmm } from '@/lib/time';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, CarIcon, ChevronIcon, PinIcon } from '@/ui/icons';
import { Button, Callout, Field, Screen, ScreenHeader, TileRow } from '@/ui/primitives';
import { PlaceSearch } from '@/ui/place-search';
import { StatusBand } from '@/ui/status-band';
import { Text } from '@/ui/text';
import { TripMap } from '@/ui/trip-map';

const TOLERANCES = [15, 30, 45] as const;
const SEATS = [1, 2, 3, 4] as const;
// Leaving times a driver can pick: 16:00 to 23:00.
const EARLIEST = EVENING_START_MIN;
const LATEST = EVENING_END_MIN;

/** Round up to the next quarter hour, inside the evening window. */
function nextSlot(): number {
  const d = new Date();
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
  return Math.min(LATEST, Math.max(EARLIEST, m));
}

export default function PostTripScreen() {
  const router = useRouter();
  const { postTrip, editTrip, cancelTrip, trips, me, role, dropOff, landmarks, error, clearError } = useStore();

  // A driver has one live trip, and the database enforces that. Coming here
  // with one already posted opens it for editing, never a second post.
  const already = trips.find(
    (t) => t.driverId === me?.id && t.status !== 'cancelled' && t.status !== 'left'
  );

  const [posting, setPosting] = useState(false);
  const [departMin, setDepartMin] = useState(already?.departMin ?? nextSlot());
  const [toleranceMin, setToleranceMin] = useState<number>(already?.toleranceMin ?? 15);
  const [seats, setSeats] = useState<number>(already?.seatsTotal ?? 3);
  // The car comes from the driver's account, set once there. A ride posted
  // before that existed keeps whatever it was posted with.
  const vehicle = me?.car ?? already?.vehicle ?? '';
  const [note, setNote] = useState(already?.note ?? '');
  const [details, setDetails] = useState(Boolean(already?.note));
  // A new ride starts from the usual destination set in Account. Changing it
  // here changes tonight's ride only, never the default.
  const usual: Destination | undefined =
    dropOff && typeof dropOff.lat === 'number' && typeof dropOff.lng === 'number'
      ? { name: dropOff.name, lat: dropOff.lat, lng: dropOff.lng }
      : undefined;
  const [destination, setDestination] = useState<Destination | undefined>(already?.destination ?? usual);
  const [searching, setSearching] = useState(false);

  // A ride is the pickup and where the driver is going. The road between them
  // comes from Mapbox, and riders are matched against that road.
  const pickup = landmarks[0];
  const stops = pickup ? [pickup.id] : [];
  const routeReady = stops.length > 0 && destination !== undefined;

  function pickDestination(p: Place) {
    setSearching(false);
    setDestination({ name: p.name, lat: p.lat, lng: p.lng });
  }

  function close() {
    clearError();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function submit() {
    if (!routeReady || posting) return;
    setPosting(true);
    clearError();
    const draft = {
      stops,
      departMin,
      toleranceMin,
      seatsTotal: seats,
      vehicle,
      note,
      destination,
      announceOnDepart: already?.announceOnDepart ?? true,
    };
    // Seats people already hold survive an edit. Changing a time is an
    // update, never a second row.
    const ok = already ? await editTrip(already.id, draft) : Boolean(await postTrip(draft));
    setPosting(false);
    // A failed post leaves the form as it was, with the reason on screen.
    if (ok) close();
  }

  async function cancelRide() {
    if (!already || posting) return;
    setPosting(true);
    await cancelTrip(already.id);
    setPosting(false);
    close();
  }

  // Posting is a driver's job. A passenger only lands here from an old link.
  if (role !== 'driver') {
    return (
      <Screen>
        <ScreenHeader title="Offer a ride" icon="close" onBack={close} />
        <Text variant="body" tone="muted">
          You are signed up as a passenger. To offer rides, switch to driving in
          your account.
        </Text>
      </Screen>
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
            label={posting ? 'Saving' : already ? 'Save changes' : 'Post ride'}
            onPress={submit}
            disabled={posting || !routeReady}
          />
          {already ? (
            <Button label="Cancel this ride" kind="danger" disabled={posting} onPress={cancelRide} />
          ) : null}
        </>
      }>
      <ScreenHeader title={already ? 'Edit your ride' : 'Offer a ride'} icon="close" onBack={close} />

      {already && already.riders.length > 0 ? (
        <Callout>
          <Text variant="small" tone="muted">
            {already.riders.length === 1 ? 'One rider has' : `${already.riders.length} riders have`} a
            seat. They keep it and see the change. For a big change, say so in the ride chat too.
          </Text>
        </Callout>
      ) : null}

      {/*
        Always shown. Before a destination is picked it sits on the pickup, so
        the driver sees where the ride starts; picking one draws the road.
      */}
      <View style={s.map}>
        <TripMap stops={stops} destination={destination} padding={{ top: 40, bottom: 24, left: 36, right: 36 }} />
      </View>

      <Field
        label={`From ${pickup ? pickup.name : 'the pickup'}, where are you going?`}
        hint={
          usual && destination?.name === usual.name
            ? 'Your usual destination from Account. Change it here for tonight only.'
            : "Riders whose drop off is along your road will see your ride. It is deleted with tonight's ride."
        }>
        <Pressable
          onPress={() => setSearching(true)}
          accessibilityRole="button"
          accessibilityLabel="Where are you going"
          style={({ pressed }) => [s.dest, pressed && s.pressed]}>
          <View style={s.destPin}>
            <PinIcon size={18} tint={color.onInk} />
          </View>
          <Text
            variant="body"
            tone={destination ? 'ink' : 'faint'}
            numberOfLines={1}
            style={[s.flex, s.destText]}>
            {destination?.name ?? 'Search an estate, junction or street'}
          </Text>
          <ChevronIcon tint={color.brandInk} />
        </Pressable>
      </Field>

      <Field label="Leaving around">
        <View style={s.time}>
          <Pressable
            accessibilityLabel="Fifteen minutes earlier"
            onPress={() => setDepartMin((m) => Math.max(EARLIEST, m - 15))}
            style={({ pressed }) => [s.step, pressed && s.pressed]}>
            <Text variant="title" tone="brand">−</Text>
          </Pressable>
          <Text variant="title" style={s.timeText}>
            {hhmm(departMin)}
          </Text>
          <Pressable
            accessibilityLabel="Fifteen minutes later"
            onPress={() => setDepartMin((m) => Math.min(LATEST, m + 15))}
            style={({ pressed }) => [s.step, pressed && s.pressed]}>
            <Text variant="title" tone="brand">+</Text>
          </Pressable>
        </View>
      </Field>

      <Field label="Give or take" hint="Riders see a window, not a fixed time.">
        <TileRow options={TOLERANCES} value={toleranceMin} onChange={setToleranceMin} render={(v) => `${v} min`} />
      </Field>

      <Field label="Seats">
        <TileRow options={SEATS} value={seats} onChange={setSeats} />
      </Field>

      <Field label="Your car" hint="From your account. Only riders with a seat see it.">
        <Pressable onPress={() => router.push('/you')} style={s.car} accessibilityRole="button">
          <CarIcon size={18} tint={color.brandInk} />
          <Text
            variant="body"
            tone={vehicle ? 'ink' : 'faint'}
            numberOfLines={1}
            style={[s.flex, vehicle ? s.moreText : null]}>
            {vehicle || 'Add your car in Account'}
          </Text>
          <Text variant="small" tone="brand" style={s.moreText}>
            {vehicle ? 'Change' : 'Add'}
          </Text>
        </Pressable>
      </Field>

      {details ? (
        <Field label="Note for riders">
          <TextInput
            value={note}
            onChangeText={setNote}
            style={[s.input, s.inputTall]}
            multiline
            placeholder="I wait five minutes at the gate"
            placeholderTextColor={color.inkFaint}
          />
        </Field>
      ) : (
        <Pressable onPress={() => setDetails(true)} style={s.more} accessibilityRole="button">
          <Text variant="body" tone="brand" style={s.moreText}>
            Add a note for riders
          </Text>
          <ChevronIcon tint={color.brandInk} />
        </Pressable>
      )}

      <Modal
        visible={searching}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSearching(false)}>
        <PlaceSearch
          placeholder="Where are you going?"
          intro="Type where you are heading tonight: an estate, a bus stop, a mall or a street."
          current={destination?.name}
          onBack={() => setSearching(false)}
          onPick={pickDestination}
          privacy="Your destination is on tonight's ride only, and is deleted with it."
        />
        <StatusBand />
      </Modal>
    </Screen>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  dest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.brand,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  destPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destText: { fontWeight: '600' },
  map: { height: 220, borderRadius: radius.xl, overflow: 'hidden', marginBottom: space.xl },
  time: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.brandSoft,
    borderRadius: radius.xl,
    padding: space.sm,
  },
  timeText: { fontVariant: ['tabular-nums'], color: color.brandInk, fontSize: 32, lineHeight: 38 },
  step: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: font.sans,
    color: color.ink,
  },
  inputTall: { minHeight: 88, textAlignVertical: 'top' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  moreText: { fontWeight: '600' },
  car: {
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
  })
);
