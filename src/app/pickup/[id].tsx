import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useStore, useTrip } from '@/data/store';
import type { Trip } from '@/data/types';
import { demoNow, hhmm, untilText } from '@/lib/time';
import { color, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ChatIcon, CheckIcon } from '@/ui/icons';
import { Avatar, Button, Callout, Row, Screen, ScreenHeader, SectionTitle } from '@/ui/primitives';
import { Text } from '@/ui/text';
import { TripMap, useRiderDrops, type RiderDrop } from '@/ui/trip-map';

export default function PickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { markPresent, markAbsent, depart, cancelTrip, person, landmark } = useStore();
  const trip = useTrip(id);
  const now = demoNow();
  const { height } = useWindowDimensions();
  const drops = useRiderDrops(trip, trip?.riders ?? []);

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="Pickup" />
        <Text variant="title">This ride is gone.</Text>
      </Screen>
    );
  }

  if (trip.status === 'left') return <OnTheirWay trip={trip} />;

  const pickup = landmark(trip.stops[0]);
  const here = trip.riders.filter((r) => trip.presentAt[r]);
  const waiting = trip.riders.filter((r) => !trip.presentAt[r]);
  const allHere = waiting.length === 0 && here.length > 0;
  const overdue = now >= trip.departMin && waiting.length > 0;
  const firstName = (pid: string) => person(pid).name.split(' ')[0];

  const headline =
    trip.riders.length === 0
      ? 'No one has booked yet'
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
                : 'Start trip'
            }
            kind="go"
            onPress={() => depart(trip.id)}
          />
          <Button
            label="Cancel this ride"
            kind="danger"
            onPress={async () => {
              await cancelTrip(trip.id);
              router.replace('/');
            }}
          />
        </>
      }>
      <ScreenHeader title={`Pickup at ${pickup.name}`} />

      <Text variant="title">{headline}</Text>
      <Text variant="body" tone="muted" style={s.sub}>
        Leaving {hhmm(trip.departMin)}, {untilText(trip.departMin, now)}
      </Text>

      {/* Where everyone gets off, before anyone gets in. */}
      <View style={[s.map, { height: Math.round(height * 0.34) }]}>
        <TripMap
          stops={trip.stops}
          destination={trip.destination}
          riderDrops={drops}
          padding={{ top: 40, bottom: 30, left: 30, right: 30 }}
        />
      </View>

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
                    {at ? `Here since ${hhmm(at)}` : 'Not here yet'}
                    {dropFor(drops, riderId) ? `, gets off at ${dropFor(drops, riderId)}` : ''}
                  </Text>
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
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { landmark, finishRide } = useStore();

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
          ? 'Nobody was at the pickup, so their seats went back to the map.'
          : `As far as ${trip.destination?.name ?? landmark(trip.stops[trip.stops.length - 1]).name}. Have a good drive.`}
      </Text>

      {/* The map is the job now, so it gets half the screen. */}
      <View style={[s.map, { height: Math.round(height * 0.5) }]}>
        <TripMap
          stops={trip.stops}
          destination={trip.destination}
          riderDrops={route}
          padding={{ top: 44, bottom: 36, left: 36, right: 36 }}
        />
      </View>

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
  riderLast: {},
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
