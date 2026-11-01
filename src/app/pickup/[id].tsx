import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { directionWords, endName, startName, useStore, useTrip } from '@/data/store';
import type { Trip } from '@/data/types';
import { naira } from '@/lib/config';
import { clock, untilText, useNow } from '@/lib/time';
import { color, radius, space, themed } from '@/theme/tokens';
import { ChatIcon, CheckIcon } from '@/ui/icons';
import { showDialog } from '@/ui/dialog';
import { Avatar, Button, Row, Screen, ScreenHeader, SectionTitle } from '@/ui/primitives';
import { LiveNotice, riderLiveText, useLiveView } from '@/ui/live';
import { PingRiders } from '@/ui/ping';
import { RecordingNotice } from '@/ui/recording-notice';
import { RidePrompt } from '@/ui/ride-prompt';
import { Text } from '@/ui/text';
import { DirectionsButton, TripMap, useRiderDrops, type RiderDrop } from '@/ui/trip-map';

export default function PickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { depart, cancelTrip, person, loading } = useStore();
  const trip = useTrip(id);
  const now = useNow();
  const { height } = useWindowDimensions();
  const drops = useRiderDrops(trip, trip?.riders ?? []);
  const live = useLiveView(trip);
  // Start and cancel each send one request. A second tap while it is out
  // would send another and show an error for a ride that already went.
  const [busy, setBusy] = useState(false);
  // On a ride home everyone booked is ticked as coming. The car owner unticks
  // anyone who did not come, then starts the ride: one tap, not one per rider.
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set());

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="Pickup" />
        {loading ? <ActivityIndicator color={color.inkFaint} /> : <Text variant="title">This ride is gone.</Text>}
      </Screen>
    );
  }

  // Ended, by the car owner's tap or by arriving at the destination.
  if (trip.endedAt) return <Ended trip={trip} />;
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

  // To work, nobody is waiting at the start: they are collected on the way.
  const coming = work ? trip.riders : trip.riders.filter((r) => !leftOut.has(r));
  const waiting = work ? [] : trip.riders.filter((r) => leftOut.has(r));

  async function go() {
    setBusy(true);
    await depart(trip!.id, coming);
    setBusy(false);
  }

  function toggle(riderId: string) {
    setLeftOut((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) next.delete(riderId);
      else next.add(riderId);
      return next;
    });
  }

  const firstName = (pid: string) => person(pid).name.split(' ')[0];

  // Leaving someone out gives their seat away, and it cannot be undone, so it
  // is asked first. Everyone coming just goes.
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
    if (waiting.length === 0) {
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
        : waiting.length === 0
          ? `${trip.riders.length} riding with you`
          : `${coming.length} of ${trip.riders.length} riding with you`;

  return (
    <Screen
      footer={
        <>
          <Button label="Start ride" kind="go" onPress={start} disabled={busy} />
          <Button label="Cancel this ride" kind="danger" onPress={cancel} disabled={busy} />
        </>
      }>
      <ScreenHeader title="Pickup" />
      <RidePrompt trip={trip} onPickupScreen />

      <Text variant="title">{headline}</Text>
      <Text variant="body" tone="muted" style={s.sub}>
        {work ? 'From' : 'At'} {startName(trip)}. Leaving {clock(trip.departMin)}, {untilText(trip.departMin, now)}
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

      <PingRiders trip={trip} />
      <LiveNotice trip={trip} />

      {trip.riders.length > 0 ? (
        <>
          <SectionTitle>{work ? 'Riders to pick up' : 'Untick anyone who did not come'}</SectionTitle>
          {trip.riders.map((riderId, i) => {
            const p = person(riderId);
            const checkedIn = trip.presentAt[riderId];
            // To work the list is who to collect, ticked off once on the road.
            const at = work ? undefined : leftOut.has(riderId) ? undefined : (checkedIn ?? 'coming');
            const where = checkedIn ? undefined : riderLiveText(trip, p.dropOff, live.riders[riderId]);
            return (
              <Pressable
                key={riderId}
                disabled={work}
                onPress={() => toggle(riderId)}
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
                    {work
                      ? 'Picked up on the way'
                      : !at
                        ? 'Not coming, their seat goes back'
                        : checkedIn
                          ? `Here since ${clock(checkedIn)}`
                          : 'Coming'}
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
                {work ? null : (
                  <View style={[s.check, at ? s.checkOn : null]}>{at ? <CheckIcon tint={color.onInk} /> : null}</View>
                )}
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

/** The ride is over: ended here, or on its own at the destination. */
function Ended({ trip }: { trip: Trip }) {
  const router = useRouter();
  const { finishRide } = useStore();
  return (
    <Screen
      footer={
        <Button
          label="Done"
          onPress={() => {
            finishRide(trip.id);
            router.replace({ pathname: '/done/[id]', params: { id: trip.id } });
          }}
        />
      }>
      <ScreenHeader title="Ride ended" />
      <Text variant="title">You have arrived</Text>
      <Text variant="body" tone="muted" style={s.sub}>
        The ride is over for everyone on it. Thanks for driving.
      </Text>
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
  const { endRide } = useStore();

  const aboard = trip.riders.filter((r) => trip.presentAt[r]);
  // Drop offs in the order the road reaches them, numbered the same on the
  // map and in the list. Someone who never said where goes last, unmarked.
  const route = useRiderDrops(trip, aboard);

  return (
    <Screen
      footer={
        <Button
          label="End ride"
          onPress={async () => {
            await endRide(trip.id);
            router.replace({ pathname: '/done/[id]', params: { id: trip.id } });
          }}
        />
      }>
      <ScreenHeader title="On the way" />
      <RidePrompt trip={trip} onPickupScreen />

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
  const { endRide, person, markPresent, markAbsent } = useStore();
  const live = useLiveView(trip);

  // Everyone booked, in pickup order. The ones still to collect are the stops.
  const order = useRiderDrops(trip, trip.riders);
  const toCollect = order.filter((r) => !trip.presentAt[r.id]);
  const aboard = trip.riders.length - toCollect.length;

  return (
    <Screen
      footer={
        <Button
          label="End ride"
          kind={toCollect.length === 0 ? 'primary' : 'secondary'}
          onPress={() => {
            const end = async () => {
              await endRide(trip.id);
              router.replace({ pathname: '/done/[id]', params: { id: trip.id } });
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
      <RidePrompt trip={trip} onPickupScreen />

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
            : 'Tap Picked up as each rider gets in. End the ride at work.'}
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
      <PingRiders trip={trip} />
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
                    {at ? `In the car since ${clock(at)}` : (r.place ?? 'Has not said where')}
                  </Text>
                  {where ? (
                    <Text variant="small" tone="brand" numberOfLines={1}>
                      {where}
                    </Text>
                  ) : null}
                </View>
                {at ? (
                  <View style={[s.check, s.checkOn]}>
                    <CheckIcon tint={color.onInk} />
                  </View>
                ) : (
                  <View style={s.pickedUp}>
                    <Text variant="small" style={s.pickedUpText}>
                      Picked up
                    </Text>
                  </View>
                )}
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
  pickedUp: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.go,
  },
  pickedUpText: { color: color.go, fontWeight: '700' },
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
