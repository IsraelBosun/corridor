import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { directionWords, endName, startName, useStore, useTrip } from '@/data/store';
import type { Trip } from '@/data/types';
import { naira } from '@/lib/config';
import { hhmm, untilText, useNow } from '@/lib/time';
import { color, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ChatIcon, CheckIcon } from '@/ui/icons';
import { showDialog } from '@/ui/dialog';
import { Avatar, Button, Callout, Row, Screen, ScreenHeader, SectionTitle } from '@/ui/primitives';
import { LiveNotice, riderLiveText, useLiveView } from '@/ui/live';
import { RecordingNotice } from '@/ui/recording-notice';
import { Text } from '@/ui/text';
import { DirectionsButton, TripMap, useRiderDrops, type RiderDrop } from '@/ui/trip-map';

export default function PickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { markPresent, markAbsent, depart, cancelTrip, person, loading } = useStore();
  const trip = useTrip(id);
  const now = useNow();
  const { height } = useWindowDimensions();
  const drops = useRiderDrops(trip, trip?.riders ?? []);
  const live = useLiveView(trip);
  // Start and cancel each send one request. A second tap while it is out
  // would send another and show an error for a ride that already went.
  const [busy, setBusy] = useState(false);

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="Pickup" />
        {loading ? <ActivityIndicator color={color.inkFaint} /> : <Text variant="title">This ride is gone.</Text>}
      </Screen>
    );
  }

  if (trip.status === 'left') return <OnTheirWay trip={trip} />;
  const work = trip.direction === 'work';

  // Cancelled somewhere else (Edit ride, or another phone) while this was open.
  if (trip.status === 'cancelled') {
    return (
      <Screen footer={<Button label="Back to the map" kind="secondary" onPress={() => router.replace('/')} />}>
        <ScreenHeader title="Pickup" />
        <Text variant="title">This ride is cancelled.</Text>
        <Text variant="body" tone="muted" style={s.sub}>
          {trip.riders.length === 0
            ? 'It is off the map.'
            : `Everyone with a seat has been told, so they can find another way ${directionWords(trip.direction)}.`}
        </Text>
      </Screen>
    );
  }

  async function go() {
    setBusy(true);
    await depart(trip!.id);
    setBusy(false);
  }

  const here = trip.riders.filter((r) => trip.presentAt[r]);
  const waiting = trip.riders.filter((r) => !trip.presentAt[r]);
  const allHere = waiting.length === 0 && here.length > 0;
  // To work, nobody is waiting at the start: they are collected on the way.
  const overdue = !work && now >= trip.departMin && waiting.length > 0;
  const firstName = (pid: string) => person(pid).name.split(' ')[0];

  // Setting off with someone still on their way leaves them behind, and it
  // cannot be undone, so it is asked first. Everyone here just goes.
  function start() {
    if (busy) return;
    // Setting off empty takes the ride off every rider's list for good, so
    // that is asked too.
    if (trip!.riders.length === 0) {
      showDialog(
        'Set off with nobody booked?',
        'The ride comes off the map, so nobody can book it after this. This cannot be undone.',
        [
          { text: 'Wait a bit', style: 'cancel' },
          { text: 'Set off', onPress: go },
        ]
      );
      return;
    }
    if (waiting.length === 0 || work) {
      go();
      return;
    }
    const who = waiting.length === 1 ? firstName(waiting[0]) : `${waiting.length} riders`;
    showDialog(
      `Leave without ${who}?`,
      `${waiting.length === 1 ? 'Their seat goes' : 'Their seats go'} back on the map so they can find another ride. This cannot be undone.`,
      [
        { text: 'Wait a bit', style: 'cancel' },
        { text: `Leave without ${who}`, style: 'destructive', onPress: go },
      ]
    );
  }

  function cancel() {
    if (busy) return;
    const n = trip!.riders.length;
    showDialog(
      `Cancel your ride ${directionWords(trip!.direction)}?`,
      n === 0
        ? 'It comes off the map straight away.'
        : `${n === 1 ? 'The rider with a seat is' : `All ${n} riders with a seat are`} told at once, so they can find another way ${directionWords(trip!.direction)}.`,
      [
        { text: 'Keep the ride', style: 'cancel' },
        {
          text: 'Cancel the ride',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            await cancelTrip(trip!.id);
            setBusy(false);
            router.replace('/');
          },
        },
      ]
    );
  }

  const headline =
    trip.riders.length === 0
      ? 'No one has booked yet'
      : work
        ? `${trip.riders.length} to pick up on the way`
        : allHere
          ? 'Everyone is here'
          : `${here.length} of ${trip.riders.length} here`;

  return (
    <Screen
      footer={
        <>
          <Button
            label={
              overdue
                ? waiting.length === 1
                  ? `Leave without ${firstName(waiting[0])}`
                  : `Leave without ${waiting.length} riders`
                : work && trip.riders.length > 0
                  ? 'Set off to pick them up'
                  : 'Start trip'
            }
            kind={overdue ? 'primary' : 'go'}
            onPress={start}
            disabled={busy}
          />
          <Button label="Cancel this ride" kind="danger" onPress={cancel} disabled={busy} />
        </>
      }>
      <ScreenHeader title="Pickup" />

      <Text variant="title">{headline}</Text>
      <Text variant="body" tone="muted" style={s.sub}>
        {work ? 'From' : 'At'} {startName(trip)}. Leaving {hhmm(trip.departMin)}, {untilText(trip.departMin, now)}
        {work && trip.riders.length > 0 ? '. Each rider waits near their pickup on your road' : ''}
        {trip.contributionNaira ? `. Each rider pays you ${naira(trip.contributionNaira)} as they get in.` : ''}
      </Text>

      {/* Where everyone gets off (or, to work, is picked up), before anyone gets in. */}
      <View style={[s.map, { height: Math.round(height * 0.34) }]}>
        <TripMap
          origin={trip.origin}
          destination={trip.destination}
          riderDrops={drops}
          live={live.markers}
          padding={{ top: 40, bottom: 30, left: 30, right: 30 }}
        />
      </View>

      <LiveNotice trip={trip} />

      {overdue ? (
        <Callout tone="stop" icon={<AlertIcon />}>
          <Text variant="small" tone="muted">
            It is past your time. Leaving now gives{' '}
            {waiting.length === 1 ? `${firstName(waiting[0])}'s seat` : 'their seats'} back, so they
            can find another ride.
          </Text>
        </Callout>
      ) : null}

      {trip.riders.length > 0 ? (
        <>
          <SectionTitle>Tap a rider when they get in</SectionTitle>
          {trip.riders.map((riderId, i) => {
            const p = person(riderId);
            const at = trip.presentAt[riderId];
            const where = at ? undefined : riderLiveText(trip, p.dropOff, live.riders[riderId]);
            return (
              <Pressable
                key={riderId}
                onPress={() => (at ? markAbsent(trip.id, riderId) : markPresent(trip.id, riderId))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!at }}
                style={({ pressed }) => [
                  s.rider,
                  i === trip.riders.length - 1 && s.riderLast,
                  pressed && s.pressed,
                ]}>
                <Avatar initials={p.initials} size={44} tone={at ? 'go' : 'person'} />
                <View style={s.flex}>
                  <Text variant="body" style={s.bold}>
                    {p.name}
                  </Text>
                  <Text variant="small" tone={at ? 'go' : 'muted'} numberOfLines={1}>
                    {at ? `${work ? 'In the car' : 'Here'} since ${hhmm(at)}` : work ? 'Not picked up yet' : 'Not here yet'}
                    {dropFor(drops, riderId)
                      ? `, ${work ? 'picked up near' : 'gets off at'} ${dropFor(drops, riderId)}`
                      : ''}
                  </Text>
                  {where ? (
                    <Text variant="small" tone="brand" numberOfLines={1}>
                      {where}
                    </Text>
                  ) : null}
                </View>
                <View style={[s.check, at ? s.checkOn : null]}>{at ? <CheckIcon tint={color.onInk} /> : null}</View>
              </Pressable>
            );
          })}
          {trip.seatsTotal > trip.riders.length ? (
            <Text variant="small" tone="muted" style={s.open}>
              {trip.seatsTotal - trip.riders.length} more {trip.seatsTotal - trip.riders.length === 1 ? 'seat is' : 'seats are'} still open.
            </Text>
          ) : null}
          <Row
            icon={<ChatIcon />}
            title="Message riders"
            subtitle="One message to everyone on this ride"
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
            last
          />
        </>
      ) : (
        <Text variant="body" tone="muted" style={s.gapTop}>
          Your ride is on the map with {trip.seatsTotal} {trip.seatsTotal === 1 ? 'seat' : 'seats'}.
          People tend to book close to when they stand up to leave.
        </Text>
      )}
    </Screen>
  );
}

/**
 * The ride is moving. The driver still needs one thing: who to drop, where,
 * in what order. The map shows the road, the list gives the order.
 */
function OnTheirWay({ trip }: { trip: Trip }) {
  if (trip.direction === 'work') return <PickingUp trip={trip} />;
  return <DroppingOff trip={trip} />;
}

function DroppingOff({ trip }: { trip: Trip }) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { finishRide } = useStore();

  const aboard = trip.riders.filter((r) => trip.presentAt[r]);
  // Drop offs in the order the road reaches them, numbered the same on the
  // map and in the list. Someone who never said where goes last, unmarked.
  const route = useRiderDrops(trip, aboard);

  return (
    <Screen
      footer={
        <Button
          label="Everyone is dropped off"
          onPress={() => {
            finishRide(trip.id);
            router.replace('/');
          }}
        />
      }>
      <ScreenHeader title="On the way" />

      <Text variant="title">
        {aboard.length === 0 ? 'Driving alone tonight' : `${aboard.length} on board`}
      </Text>
      <Text variant="body" tone="muted" style={s.sub}>
        {aboard.length === 0
          ? `Nobody is riding with you, so head straight for ${endName(trip)}. Have a good drive.`
          : `As far as ${endName(trip)}. Have a good drive.`}
      </Text>

      {/* The map is the job now, so it gets half the screen. */}
      <View style={[s.map, { height: Math.round(height * 0.5) }]}>
        <TripMap
          origin={trip.origin}
          destination={trip.destination}
          riderDrops={route}
          padding={{ top: 44, bottom: 36, left: 36, right: 36 }}
        />
      </View>

      <DirectionsButton trip={trip} drops={route} />

      <RecordingNotice />

      {route.length > 0 ? (
        <>
          <SectionTitle>Drop offs, in order</SectionTitle>
          {route.map((r, i) => (
            <Row
              key={r.id}
              icon={
                <View style={s.num}>
                  <Text variant="small" style={s.numText}>
                    {r.num}
                  </Text>
                </View>
              }
              title={r.name}
              subtitle={r.place ?? 'Has not said where'}
              last={i === route.length - 1}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * A morning ride on the road: the pickups still to make, in the order the
 * road reaches them, each ticked off as the rider gets in, then work.
 */
function PickingUp({ trip }: { trip: Trip }) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { finishRide, person, markPresent, markAbsent } = useStore();
  const live = useLiveView(trip);

  // Everyone booked, in pickup order. The ones still to collect are the stops.
  const order = useRiderDrops(trip, trip.riders);
  const toCollect = order.filter((r) => !trip.presentAt[r.id]);
  const aboard = trip.riders.length - toCollect.length;

  return (
    <Screen
      footer={
        <Button
          label={toCollect.length === 0 ? `Everyone is at ${endName(trip)}` : 'End the ride'}
          kind={toCollect.length === 0 ? 'primary' : 'secondary'}
          onPress={() => {
            const end = () => {
              finishRide(trip.id);
              router.replace('/');
            };
            if (toCollect.length === 0) return end();
            // Someone still waiting at their pickup would be left there,
            // watching for a car that is not coming. Asked first.
            const who = toCollect.length === 1 ? toCollect[0].name.split(' ')[0] : `${toCollect.length} riders`;
            showDialog(
              `End the ride without ${who}?`,
              'They have not been picked up. Tell them in the ride chat so they can find another way to work.',
              [
                { text: 'Keep going', style: 'cancel' },
                { text: 'End the ride', style: 'destructive', onPress: end },
              ]
            );
          }}
        />
      }>
      <ScreenHeader title="Picking up" />

      <Text variant="title">
        {trip.riders.length === 0
          ? 'Driving alone this morning'
          : toCollect.length === 0
            ? `Everyone is in, ${aboard} on board`
            : `${toCollect.length} still to pick up`}
      </Text>
      <Text variant="body" tone="muted" style={s.sub}>
        {trip.riders.length === 0
          ? `Nobody is riding with you, so head straight for ${endName(trip)}. Have a good drive.`
          : toCollect.length === 0
            ? `Next stop, ${endName(trip)}. Have a good drive.`
            : 'Tap each rider as they get in. Then on to work.'}
      </Text>

      <View style={[s.map, { height: Math.round(height * 0.42) }]}>
        <TripMap
          origin={trip.origin}
          destination={trip.destination}
          riderDrops={toCollect}
          live={live.markers}
          padding={{ top: 44, bottom: 36, left: 36, right: 36 }}
        />
      </View>

      <DirectionsButton trip={trip} drops={toCollect} />
      <LiveNotice trip={trip} />
      <RecordingNotice />

      {order.length > 0 ? (
        <>
          <SectionTitle>Pickups, in order</SectionTitle>
          {order.map((r, i) => {
            const at = trip.presentAt[r.id];
            const where = at ? undefined : riderLiveText(trip, person(r.id).dropOff, live.riders[r.id]);
            return (
              <Pressable
                key={r.id}
                onPress={() => (at ? markAbsent(trip.id, r.id) : markPresent(trip.id, r.id))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!at }}
                style={({ pressed }) => [s.rider, i === order.length - 1 && s.riderLast, pressed && s.pressed]}>
                <View style={s.num}>
                  <Text variant="small" style={s.numText}>
                    {r.num}
                  </Text>
                </View>
                <View style={s.flex}>
                  <Text variant="body" style={s.bold}>
                    {r.name}
                  </Text>
                  <Text variant="small" tone={at ? 'go' : 'muted'} numberOfLines={1}>
                    {at ? `In the car since ${hhmm(at)}` : (r.place ?? 'Has not said where')}
                  </Text>
                  {where ? (
                    <Text variant="small" tone="brand" numberOfLines={1}>
                      {where}
                    </Text>
                  ) : null}
                </View>
                <View style={[s.check, at ? s.checkOn : null]}>{at ? <CheckIcon tint={color.onInk} /> : null}</View>
              </Pressable>
            );
          })}
          <Row
            icon={<ChatIcon />}
            title="Message riders"
            subtitle="One message to everyone on this ride"
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
            last
          />
        </>
      ) : null}
    </Screen>
  );
}

/** The place a rider named, for the line under their name. */
function dropFor(drops: RiderDrop[], riderId: string): string | undefined {
  return drops.find((d) => d.id === riderId)?.place;
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.6 },
  sub: { marginTop: space.xs, marginBottom: space.md },
  gapTop: { marginTop: space.md },
  rider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  riderLast: { borderBottomWidth: 0 },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.go, borderColor: color.go },
  open: { paddingVertical: space.md },
  map: { borderRadius: radius.xl, overflow: 'hidden', marginTop: space.sm, marginBottom: space.sm },
  // The same lime badge as the marker on the map, so 2 here is 2 there.
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { color: color.onAccent, fontWeight: '800', fontSize: 12, lineHeight: 15 },
  })
);
