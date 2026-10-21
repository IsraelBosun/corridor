import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { usePayout } from '@/data/payout';
import { daysText } from '@/data/plans';
import { directionNow, directionWords, useStore } from '@/data/store';
import type { Destination, Direction } from '@/data/types';
import type { Place } from '@/lib/places';
import {
  CONTRIBUTION_NAIRA,
  EVENING_END_MIN,
  EVENING_START_MIN,
  MORNING_END_MIN,
  MORNING_START_MIN,
  naira,
} from '@/lib/config';
import { loadLastOrigin, saveLastOrigin } from '@/lib/origin';
import { hasPhone, noPhones } from '@/lib/phones';
import { hhmm, nowMinutes } from '@/lib/time';
import { color, font, LIME, PINE, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, CarIcon, ChevronIcon, PinIcon } from '@/ui/icons';
import { showDialog } from '@/ui/dialog';
import { Button, Callout, Field, Screen, ScreenHeader, TileRow } from '@/ui/primitives';
import { PlaceSearch } from '@/ui/place-search';
import { StatusBand } from '@/ui/status-band';
import { Text } from '@/ui/text';
import { TripMap } from '@/ui/trip-map';

const TOLERANCES = [15, 30, 45] as const;
const SEATS = [1, 2, 3, 4] as const;
/** The database's limit on a ride's note (trips.note). */
const NOTE_MAX = 300;

/** Leaving times a driver can pick: 05:30 to 10:00 to work, 16:00 to 23:00 home. */
const WINDOW: Record<Direction, { earliest: number; latest: number }> = {
  work: { earliest: MORNING_START_MIN, latest: MORNING_END_MIN },
  home: { earliest: EVENING_START_MIN, latest: EVENING_END_MIN },
};

/** Round up to the next quarter hour, inside the window. */
function nextSlot(d: Direction): number {
  const { earliest, latest } = WINDOW[d];
  const m = Math.ceil(nowMinutes() / 15) * 15;
  return Math.min(latest, Math.max(earliest, m));
}

/** The earliest time a new ride can be set to: not before now, rounded down to the quarter. */
function firstSlot(d: Direction): number {
  const { earliest, latest } = WINDOW[d];
  const m = Math.floor(nowMinutes() / 15) * 15;
  return Math.min(latest, Math.max(earliest, m));
}

/**
 * Post a ride, or edit one: /post?id= edits that ride, /post?direction=work
 * starts a ride to work. The form is keyed by the ride, so moving from a new
 * post to editing an existing one starts it fresh.
 */
export default function PostTripScreen() {
  const { id, direction } = useLocalSearchParams<{ id?: string; direction?: Direction }>();
  return <PostForm key={id ?? 'new'} editId={id} startDirection={direction} />;
}

function PostForm({ editId, startDirection }: { editId?: string; startDirection?: Direction }) {
  const router = useRouter();
  const { postTrip, editTrip, cancelTrip, trips, me, role, dropOff, myTripFor, error, clearError } = useStore();

  // The ride being edited, if it is still the driver's and still waiting.
  const already = editId
    ? trips.find((t) => t.id === editId && t.driverId === me?.id && t.status !== 'cancelled' && t.status !== 'left')
    : undefined;

  // A new ride goes the way the clock suggests unless the driver says
  // otherwise. A posted ride keeps its direction; the database insists.
  const [dir, setDir] = useState<Direction>(
    already?.direction ?? (startDirection === 'work' || startDirection === 'home' ? startDirection : directionNow(nowMinutes()))
  );
  const { latest: LATEST } = WINDOW[dir];
  // A driver has one live ride each way, and the database enforces that.
  // Choosing a way that already has one offers to edit it instead.
  const existing = already ? undefined : myTripFor(dir);

  const [posting, setPosting] = useState(false);
  const [departMin, setDepartMin] = useState(already?.departMin ?? nextSlot(dir));
  // Weekdays to post this ride again on, for a new ride. None is a one off.
  const [repeat, setRepeat] = useState<number[]>([]);
  const [toleranceMin, setToleranceMin] = useState<number>(already?.toleranceMin ?? 15);
  // Seats already taken cannot be taken away by an edit.
  const booked = already?.riders.length ?? 0;
  const seatOptions = SEATS.filter((n) => n >= Math.max(1, booked));
  const [seats, setSeats] = useState<number>(Math.max(already?.seatsTotal ?? 3, booked));
  // A ride cannot be moved into the past, new or edited. An edit may keep a
  // time that has already gone by, but not go further back than it.
  // After the last slot there is nothing left to post that way today.
  const pastToday = !already && nowMinutes() > LATEST;
  // Too late for today, but a regular ride can still be set up for the days
  // ahead, at any time in the window.
  const planOnly = pastToday && repeat.length > 0;
  const tooLate = pastToday && !planOnly;
  const earliest = already
    ? Math.min(already.departMin, firstSlot(dir))
    : planOnly
      ? WINDOW[dir].earliest
      : firstSlot(dir);
  // The car comes from the driver's account, set once there. A ride posted
  // before that existed keeps whatever it was posted with.
  const vehicle = me?.car ?? already?.vehicle ?? '';
  const [note, setNote] = useState(already?.note ?? '');
  // Free, or the one flat contribution Corridor sets. Never an amount the
  // driver types. Riders booked a free ride on those terms, so once anyone
  // has, it stays free.
  const [paid, setPaid] = useState(Boolean(already?.contributionNaira));
  const lockedFree = Boolean(already && !already.contributionNaira && already.riders.length > 0);
  const { payout, loading: payoutLoading, failed: payoutFailed, reload: reloadPayout } = usePayout(me?.id, paid);
  // Back from Account with details just saved: look again.
  useFocusEffect(
    useCallback(() => {
      reloadPayout();
    }, [reloadPayout])
  );
  // A paid ride needs somewhere to send the money. The database refuses one
  // without bank details too; this says so before the driver taps Post.
  // A failed check is not "none saved": the driver is not told to add details
  // they may already have, and Post stays open. The database still refuses a
  // paid ride with no details, with its own sentence.
  const needsBank = paid && !payoutLoading && !payoutFailed && !payout;
  const notePhone = hasPhone(note);
  const [details, setDetails] = useState(Boolean(already?.note));
  // The usual place set in Account: where an evening ride ends, and where a
  // morning ride starts. Changing it here changes this ride only.
  const usual: Destination | undefined =
    dropOff && typeof dropOff.lat === 'number' && typeof dropOff.lng === 'number'
      ? { name: dropOff.name, lat: dropOff.lat, lng: dropOff.lng }
      : undefined;
  const startsWork = !already && dir === 'work';
  const [destination, setDestination] = useState<Destination | undefined>(
    already?.destination ?? (startsWork ? undefined : usual)
  );
  // Where an evening ride starts is the driver's to say. A new one starts
  // from wherever their last one did, remembered on this phone only. A
  // morning ride goes the other way: from the usual place, to that start.
  const [origin, setOrigin] = useState<Destination | undefined>(already?.origin ?? (startsWork ? usual : undefined));
  useEffect(() => {
    if (already) return;
    let alive = true;
    loadLastOrigin().then((last) => {
      if (!alive || !last) return;
      if (startsWork) setDestination((d) => d ?? last);
      else setOrigin((o) => o ?? last);
    });
    return () => {
      alive = false;
    };
    // Only on opening: a later switch of direction swaps the two ends instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [already?.id]);

  /** The other way: the same two places, swapped, and a time in that window. */
  function switchDirection(next: Direction) {
    if (already || next === dir) return;
    setDir(next);
    setDepartMin(nextSlot(next));
    setOrigin(destination);
    setDestination(origin);
  }
  const [searching, setSearching] = useState<'from' | 'to' | null>(null);

  // A ride is where the driver starts and where they are going. The road
  // between them comes from Mapbox, and riders are matched against that road.
  const routeReady = origin !== undefined && destination !== undefined;

  function pick(p: Place) {
    const place = { name: p.name, lat: p.lat, lng: p.lng };
    if (searching === 'from') setOrigin(place);
    else setDestination(place);
    setSearching(null);
  }

  function close() {
    clearError();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function submit() {
    if (!routeReady || posting || tooLate || notePhone) return;
    setPosting(true);
    clearError();
    const draft = {
      direction: dir,
      origin,
      departMin,
      toleranceMin,
      seatsTotal: seats,
      vehicle,
      note,
      destination,
      announceOnDepart: already?.announceOnDepart ?? true,
      contributionNaira: paid ? CONTRIBUTION_NAIRA : undefined,
    };
    // Seats people already hold survive an edit. Changing a time is an
    // update, never a second row.
    const ok = already ? await editTrip(already.id, draft) : Boolean(await postTrip(draft, repeat, !planOnly));
    setPosting(false);
    // The office end is what is worth remembering: where an evening ride
    // starts, and where a morning ride ends.
    const officeEnd = dir === 'home' ? origin : destination;
    if (ok && officeEnd) saveLastOrigin(officeEnd);
    // A failed post leaves the form as it was, with the reason on screen.
    if (ok) close();
  }

  const home = dir === 'home';

  function cancelRide() {
    if (!already || posting) return;
    const n = already.riders.length;
    showDialog(
      `Cancel your ride ${directionWords(already.direction)}?`,
      n === 0
        ? 'It comes off the map straight away.'
        : `${n === 1 ? 'The rider with a seat is' : `All ${n} riders with a seat are`} told at once, so they can find another way ${directionWords(already.direction)}.`,
      [
        { text: 'Keep the ride', style: 'cancel' },
        {
          text: 'Cancel the ride',
          style: 'destructive',
          onPress: async () => {
            setPosting(true);
            await cancelTrip(already.id);
            setPosting(false);
            close();
          },
        },
      ]
    );
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
            label={
              posting
                ? 'Saving'
                : already
                  ? 'Save changes'
                  : planOnly
                    ? 'Set up regular ride'
                    : home
                      ? 'Post ride home'
                      : 'Post ride to work'
            }
            onPress={submit}
            disabled={posting || !routeReady || tooLate || needsBank || notePhone || Boolean(existing)}
          />
          {already ? (
            <Button label="Cancel this ride" kind="danger" disabled={posting} onPress={cancelRide} />
          ) : null}
        </>
      }>
      <ScreenHeader
        title={already ? `Edit your ride ${directionWords(already.direction)}` : 'Offer a ride'}
        icon="close"
        onBack={close}
      />

      {already ? null : (
        <Field label="Going">
          <TileRow
            options={['work', 'home'] as const}
            value={dir}
            onChange={switchDirection}
            render={(v) => (v === 'work' ? 'To work' : 'Home')}
          />
        </Field>
      )}

      {existing ? (
        <Callout icon={<AlertIcon />}>
          <Text variant="small" tone="muted">
            You already have a ride {directionWords(dir)} posted for {hhmm(existing.departMin)}. You
            can have one each way.
          </Text>
          <Button
            label="Edit that ride"
            kind="secondary"
            onPress={() => router.replace({ pathname: '/post', params: { id: existing.id } })}
          />
        </Callout>
      ) : tooLate ? (
        <Callout icon={<AlertIcon />}>
          <Text variant="small" tone="muted">
            {home
              ? `Rides home can leave up to ${hhmm(LATEST)}, so tonight is over. Come back tomorrow afternoon to post.`
              : `Rides to work can leave up to ${hhmm(LATEST)}, so this morning is over. Post tomorrow morning from ${hhmm(MORNING_START_MIN)}, or offer a ride home.`}{' '}
            To set up a regular ride for the days ahead, pick them under Repeat.
          </Text>
        </Callout>
      ) : planOnly ? (
        <Callout>
          <Text variant="small" tone="muted">
            Too late for a ride {directionWords(dir)} today, so this sets up the regular ride. It is
            posted for you from the next day you picked.
          </Text>
        </Callout>
      ) : null}

      {already?.planId ? (
        <Callout>
          <Text variant="small" tone="muted">
            One of your regular rides. Changes here are for today only. To change the days, or stop
            it, go to Regular rides in your account.
          </Text>
        </Callout>
      ) : null}

      {already && already.riders.length > 0 ? (
        <Callout>
          <Text variant="small" tone="muted">
            {already.riders.length === 1 ? 'One rider has' : `${already.riders.length} riders have`} a
            seat. They keep it and see the change. For a big change, say so in the ride chat too.
          </Text>
        </Callout>
      ) : null}

      {/*
        Always shown. Before anything is picked it sits on the phone's own
        position; picking both ends draws the road.
      */}
      <View style={s.map}>
        <TripMap origin={origin} destination={destination} padding={{ top: 40, bottom: 24, left: 36, right: 36 }} />
      </View>

      <Field
        label="Starting from"
        hint={
          home
            ? 'Riders meet you here. Be as exact as the gate or the car park.'
            : 'Where you set off. Riders are picked up along your road, near where they live.'
        }>
        <Pressable
          onPress={() => setSearching('from')}
          accessibilityRole="button"
          accessibilityLabel="Where are you starting from"
          style={({ pressed }) => [s.dest, pressed && s.pressed]}>
          <View style={[s.destPin, s.fromPin]}>
            <View style={s.fromDot} />
          </View>
          <Text
            variant={origin ? 'heading' : 'body'}
            tone={origin ? 'ink' : 'faint'}
            numberOfLines={1}
            style={s.flex}>
            {origin?.name ?? (home ? 'Search where riders meet you' : 'Search your estate or street')}
          </Text>
          <ChevronIcon tint={color.inkMuted} />
        </Pressable>
      </Field>

      <Field
        label="Heading to"
        hint={
          home && usual && destination?.name === usual.name
            ? 'Your usual destination from Account. Change it here for tonight only.'
            : home
              ? 'Riders dropping off along your road will see this ride.'
              : 'Where you work. Riders picked up along your road, and going there, will see this ride.'
        }>
        <Pressable
          onPress={() => setSearching('to')}
          accessibilityRole="button"
          accessibilityLabel="Where are you going"
          style={({ pressed }) => [s.dest, pressed && s.pressed]}>
          <View style={s.destPin}>
            <PinIcon size={18} tint={LIME} />
          </View>
          <Text
            variant={destination ? 'heading' : 'body'}
            tone={destination ? 'ink' : 'faint'}
            numberOfLines={1}
            style={s.flex}>
            {destination?.name ?? (home ? 'Search an estate, junction or street' : 'Search your office or car park')}
          </Text>
          <ChevronIcon tint={color.inkMuted} />
        </Pressable>
      </Field>

      <Field label="Leaving around">
        <View style={s.time}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fifteen minutes earlier"
            accessibilityState={{ disabled: departMin <= earliest }}
            disabled={departMin <= earliest}
            onPress={() => setDepartMin((m) => Math.max(earliest, m - 15))}
            style={({ pressed }) => [s.step, departMin <= earliest && s.stepOff, pressed && s.pressed]}>
            <Text variant="title" style={s.stepMinus}>−</Text>
          </Pressable>
          <Text variant="display" style={s.timeText} accessibilityLabel={`Leaving around ${hhmm(departMin)}`}>
            {hhmm(departMin)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fifteen minutes later"
            accessibilityState={{ disabled: departMin >= LATEST }}
            disabled={departMin >= LATEST}
            onPress={() => setDepartMin((m) => Math.min(LATEST, m + 15))}
            style={({ pressed }) => [s.step, s.stepPlus, departMin >= LATEST && s.stepOff, pressed && s.pressed]}>
            <Text variant="title" style={s.stepPlusText}>+</Text>
          </Pressable>
        </View>
      </Field>

      {already ? null : (
        <Field
          label="Repeat"
          hint={
            repeat.length === 0
              ? 'Just today. Pick days to have this ride posted for you every week.'
              : `Posted for you every ${daysText(repeat)} at ${hhmm(departMin)}. Change or stop it in your account.`
          }>
          <DayPicker value={repeat} onChange={setRepeat} />
        </Field>
      )}

      <Field label="Give or take" hint="Riders see a window, not a fixed time.">
        <TileRow options={TOLERANCES} value={toleranceMin} onChange={setToleranceMin} render={(v) => `${v} min`} />
      </Field>

      <Field
        label="Seats"
        hint={booked > 0 ? `${booked} ${booked === 1 ? 'is' : 'are'} already taken, so you cannot go below that.` : undefined}>
        <TileRow options={seatOptions} value={seats} onChange={setSeats} />
      </Field>

      <Field
        label="Fuel contribution"
        hint={
          lockedFree
            ? 'Riders booked this ride as free, so it stays free tonight.'
            : paid
              ? needsBank
                ? undefined
                : `Each rider pays you ${naira(CONTRIBUTION_NAIRA)} directly, in cash or by transfer, to ${payout?.bankName ?? 'your account'}. Corridor never handles it.`
              : 'Riders pay nothing. You can ask for a contribution on any ride before anyone books.'
        }>
        <TileRow
          options={lockedFree ? (['free'] as const) : (['free', 'paid'] as const)}
          value={paid ? 'paid' : 'free'}
          onChange={(v) => setPaid(v === 'paid')}
          render={(v) => (v === 'free' ? 'Free' : `${naira(CONTRIBUTION_NAIRA)} each`)}
        />
        {needsBank ? (
          <View style={s.needBank}>
            <Callout tone="stop" icon={<AlertIcon />}>
              <Text variant="small" tone="muted">
                To ask for {naira(CONTRIBUTION_NAIRA)}, add the account riders should pay into. It
                takes a minute, and you only do it once.
              </Text>
            </Callout>
            <Button label="Add bank details" kind="secondary" arrow onPress={() => router.push('/you')} />
          </View>
        ) : paid && payoutFailed ? (
          <Pressable onPress={reloadPayout} accessibilityRole="button" style={s.needBank}>
            <Text variant="small" tone="muted">
              Could not check your bank details. Tap to try again.
            </Text>
          </Pressable>
        ) : null}
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
            maxLength={NOTE_MAX}
            placeholder="I wait five minutes, then go"
            placeholderTextColor={color.inkFaint}
          />
          {notePhone ? (
            <Text variant="small" tone="stop" style={s.noteError}>
              {noPhones('the note')}
            </Text>
          ) : note.length > NOTE_MAX - 40 ? (
            <Text variant="small" tone="faint" style={s.noteError}>
              {note.length}/{NOTE_MAX}
            </Text>
          ) : null}
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
        visible={searching !== null}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSearching(null)}>
        {searching === 'from' ? (
          <PlaceSearch
            placeholder="Where are you starting from?"
            intro={
              home
                ? 'Type where riders should meet you: a building, a gate, a car park or a street.'
                : 'Type your estate, a junction or a street near home. Not your house number.'
            }
            current={origin?.name}
            onBack={() => setSearching(null)}
            onPick={pick}
            privacy={
              home
                ? 'Riders on your ride see where you start. This phone remembers it for your next ride.'
                : 'Riders on your ride see where you start.'
            }
            offerHere
          />
        ) : (
          <PlaceSearch
            placeholder="Where are you going?"
            intro={
              home
                ? 'Type where you are heading tonight: an estate, a bus stop, a mall or a street.'
                : 'Type where you work: the building, the gate or the car park.'
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

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const weekdays = value.length === 5 && [1, 2, 3, 4, 5].every((n) => value.includes(n));
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
      <Pressable onPress={() => onChange(weekdays ? [] : [1, 2, 3, 4, 5])} accessibilityRole="button" hitSlop={6}>
        <Text variant="small" tone="brand" style={s.moreText}>
          {weekdays ? 'Just today' : 'Every weekday'}
        </Text>
      </Pressable>
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
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
  dest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  destPin: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: PINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromPin: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  fromDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: PINE, backgroundColor: LIME },
  map: { height: 150, borderRadius: radius.xl, overflow: 'hidden', marginBottom: space.xl },
  // Pine in both themes: the time is the one number on this screen that matters.
  time: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PINE,
    borderRadius: radius.xl,
    padding: space.md,
  },
  timeText: { fontVariant: ['tabular-nums'], color: '#FFFFFF', fontSize: 44, lineHeight: 50 },
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
  needBank: { gap: space.sm, marginTop: space.sm },
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
  noteError: { marginTop: space.xs },
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
