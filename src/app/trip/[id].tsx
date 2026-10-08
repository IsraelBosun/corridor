import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/data/session';
import { endName, seatsOpen, startName, useStore, useTrip } from '@/data/store';
import type { Trip } from '@/data/types';
import { demoNow, hhmm, untilText } from '@/lib/time';
import { color, GUTTER, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, BackIcon, CarIcon, ChatIcon, CheckIcon } from '@/ui/icons';
import { Avatar, Button, Callout, Row, RoundButton, Screen, ScreenHeader } from '@/ui/primitives';
import { Text } from '@/ui/text';
import { TripMap } from '@/ui/trip-map';
import { TripRow } from '@/ui/trip-row';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const {
    reserve,
    releaseSeat,
    markPresent,
    finishRide,
    dropOff,
    dropOffName,
    serves,
    person,
    me,
    role,
    error,
    clearError,
  } = useStore();
  const { tester } = useSession();
  const trip = useTrip(id);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = demoNow();

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="Ride" />
        <Text variant="title">This ride is gone.</Text>
        <Text variant="body" tone="muted" style={s.gap}>
          The driver took it down. Other rides are on the map.
        </Text>
      </Screen>
    );
  }

  if (trip.status === 'cancelled') return <CancelledTrip trip={trip} />;

  const driver = person(trip.driverId);
  const open = seatsOpen(trip);
  // A tester in rider mode looking at their own ride sees it as a rider does.
  const iAmDriving = me ? trip.driverId === me.id && role === 'driver' : false;
  const mine = me ? trip.riders.includes(me.id) : false;
  const present = !!(me && trip.presentAt[me.id]);
  const start = startName(trip);
  const passes = dropOff ? serves(trip) : undefined;

  async function onReserve() {
    setBusy(true);
    setFailed(false);
    clearError();
    const ok = await reserve(trip!.id);
    setBusy(false);
    if (!ok) setFailed(true);
  }

  /*
    Why a booking did not go through. The database says no for several
    reasons and only one of them is a lost race, so the reason is worked out
    from the trip as it is now (the store refreshes after every attempt). A
    refusal the database explains in words arrives as the store's error.
  */
  const refusal: { title: string; body: string } | null = !failed
    ? null
    : error
      ? { title: 'That seat could not be reserved.', body: error }
      : trip.status !== 'posted' && trip.status !== 'boarding'
        ? { title: 'This ride has already left.', body: 'Other rides are on the map.' }
        : open === 0
          ? {
              // Two riders can tap the last seat in the same second. The loser
              // is told plainly rather than left looking at a seat that is not there.
              title: 'That seat went while you were reading.',
              body: 'Someone confirmed a second before you. Other rides are on the map.',
            }
          : me && trip.driverId === me.id && !tester
            ? {
                title: 'This is your own ride.',
                body: 'Only accounts on the testers list can book a seat in their own ride.',
              }
            : me && trip.driverId === me.id
              ? {
                  // The app knows this person is a tester, so the database's
                  // booking rule is the older one that predates testers.
                  title: 'The database refused your own ride.',
                  body: 'You are on the testers list, but the booking rule in the database is out of date. Rerun the testers migration.',
                }
              : {
                  title: 'That seat could not be reserved.',
                  body: 'The ride is no longer open to you. Other rides are on the map.',
                };

  const mapHeight = Math.round(height * 0.38);

  return (
    <View style={s.screen}>
      <View style={{ height: mapHeight + 24 }}>
        <TripMap
          origin={trip.origin}
          destination={trip.destination}
          dropOff={dropOff}
          padding={{ top: insets.top + 56, bottom: 56, left: 40, right: 40 }}
        />
        <RoundButton
          label="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={[s.back, { top: insets.top + space.sm }]}>
          <BackIcon />
        </RoundButton>
      </View>

      <SafeAreaView style={s.panel} edges={['bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {trip.status === 'left' ? (
            <>
              <Text variant="title">On the way</Text>
              <Text variant="body" tone="muted" style={s.sub}>
                Set off from {start}. It was due at {hhmm(trip.departMin)}.
              </Text>
            </>
          ) : (
            <>
              <Text variant="title">{untilText(trip.departMin, now)}</Text>
              <Text variant="body" tone="muted" style={s.sub}>
                Leaves {hhmm(trip.departMin)}, give or take {trip.toleranceMin} min
              </Text>
            </>
          )}

          {refusal ? (
            <Callout tone="stop" icon={<AlertIcon />}>
              <Text variant="body" tone="stop" style={s.bold}>
                {refusal.title}
              </Text>
              <Text variant="small" tone="muted">
                {refusal.body}
              </Text>
            </Callout>
          ) : null}

          {/* The route, as a ride hailing app shows it: from, via, to. */}
          <View style={s.route}>
            <RouteStop kind="start" title={start} note="Pickup" />
            {passes ? <RouteStop kind="mine" title={dropOffName} note="Where you get off, on the way" /> : null}
            <RouteStop
              kind="end"
              title={endName(trip)}
              note="Where the driver is going"
              last
            />
          </View>

          {dropOff && passes === false ? (
            <Text variant="small" tone="stop" style={s.warn}>
              This ride does not pass {dropOffName}.
            </Text>
          ) : null}

          <View style={s.driver}>
            <Avatar initials={driver.initials} size={52} />
            <View style={s.flex}>
              <Text variant="heading">{driver.name}</Text>
              {[driver.team, driver.floor].filter(Boolean).length > 0 ? (
                <Text variant="small" tone="muted">
                  {[driver.team, driver.floor].filter(Boolean).join(', ')}
                </Text>
              ) : null}
            </View>
            <View style={s.seatBadge}>
              <Text variant="small" tone={open === 0 ? 'faint' : 'go'} style={s.bold}>
                {open === 0 ? 'Full' : `${open} of ${trip.seatsTotal} free`}
              </Text>
            </View>
          </View>

          {trip.note ? (
            <View style={s.note}>
              <Text variant="body">{trip.note}</Text>
            </View>
          ) : null}

          {mine ? (
            <View>
              <Row
                icon={<ChatIcon />}
                title="Message the ride"
                subtitle={`${driver.name.split(' ')[0]} and ${trip.riders.length} ${trip.riders.length === 1 ? 'rider' : 'riders'}`}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
              />
              <Row icon={<CarIcon />} title={trip.vehicle || 'Car not described yet'} subtitle="How to spot the car" last />
            </View>
          ) : null}

          <Text variant="small" tone="faint" style={s.foot}>
            Drivers and vehicles are not vetted. You travel at your own risk.
          </Text>
        </ScrollView>

        <View style={s.footer}>
          {iAmDriving ? (
            <Button
              label="Go to pickup"
              arrow
              onPress={() => router.replace({ pathname: '/pickup/[id]', params: { id: trip.id } })}
            />
          ) : mine && trip.status === 'left' ? (
            // On the road: no checking in or giving the seat up now, only
            // saying the ride is over.
            <Button
              label="I have been dropped off"
              kind="go"
              onPress={() => {
                finishRide(trip.id);
                router.replace('/');
              }}
            />
          ) : mine ? (
            <>
              {present ? (
                <View style={s.checked}>
                  <CheckIcon />
                  <Text variant="body" tone="go" style={s.bold}>
                    Checked in at {start}, {hhmm(trip.presentAt[me!.id])}
                  </Text>
                </View>
              ) : (
                <Button
                  label={`I am at ${start}`}
                  kind="go"
                  onPress={() => me && markPresent(trip.id, me.id)}
                />
              )}
              <Button label="Give up my seat" kind="danger" onPress={() => releaseSeat(trip.id)} />
            </>
          ) : role === 'driver' ? (
            <Text variant="small" tone="muted" center style={s.driverNote}>
              You are signed up as a driver. To take a seat instead, switch to
              riding in your account.
            </Text>
          ) : (
            <Button
              label={open === 0 ? 'No seats left' : busy ? 'Reserving' : 'Reserve a seat'}
              onPress={onReserve}
              disabled={open === 0 || busy}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function RouteStop({
  kind,
  title,
  note,
  last,
}: {
  kind: 'start' | 'mine' | 'end';
  title: string;
  note: string;
  last?: boolean;
}) {
  return (
    <View style={s.stop}>
      <View style={s.rail}>
        <View style={kind === 'start' ? s.dotStart : kind === 'mine' ? s.dotMine : s.dotEnd} />
        {!last ? <View style={s.railLine} /> : null}
      </View>
      <View style={[s.flex, !last && s.stopGap]}>
        <Text variant="body" style={s.bold}>
          {title}
        </Text>
        <Text variant="small" tone="muted">
          {note}
        </Text>
      </View>
    </View>
  );
}

/**
 * The cancellation recovery screen. It leads with alternatives, not an
 * apology, because the rider still needs a way home.
 */
function CancelledTrip({ trip }: { trip: Trip }) {
  const router = useRouter();
  const { trips, serves, person, dropOff } = useStore();
  const now = demoNow();

  const alternatives = trips
    .filter(
      (t) =>
        t.id !== trip.id &&
        (t.status === 'posted' || t.status === 'boarding') &&
        seatsOpen(t) > 0 &&
        (!dropOff || serves(t)) &&
        t.departMin >= now - 10
    )
    .sort((a, b) => a.departMin - b.departMin)
    .slice(0, 4);

  const minsBefore = trip.cancelledAtMin ? trip.departMin - trip.cancelledAtMin : 0;

  return (
    <Screen
      footer={<Button label="Back to the map" kind="secondary" onPress={() => router.replace('/')} />}>
      <ScreenHeader title={`Ride ${trip.code}`} />

      <Callout tone="stop" icon={<AlertIcon />}>
        <Text variant="body" tone="stop" style={s.bold}>
          {person(trip.driverId).name.split(' ')[0]} cancelled
          {trip.cancelledAtMin ? ` at ${hhmm(trip.cancelledAtMin)}` : ''}
        </Text>
        {minsBefore > 0 ? (
          <Text variant="small" tone="muted">
            {minsBefore} minutes before it was due to leave.
          </Text>
        ) : null}
      </Callout>

      <Text variant="title" style={s.recoverTitle}>
        You still need a way home.
      </Text>
      <Text variant="body" tone="muted" style={s.sub}>
        {alternatives.length === 0
          ? 'Nothing else going your way has a seat right now. New rides show up on the map as they are posted.'
          : alternatives.length === 1
            ? 'One ride going your way still has a seat.'
            : `${alternatives.length} rides going your way still have seats.`}
      </Text>

      {alternatives.map((alt) => (
        <TripRow
          key={alt.id}
          trip={alt}
          now={now}
          onPress={() => router.replace({ pathname: '/trip/[id]', params: { id: alt.id } })}
        />
      ))}

      <Text variant="small" tone="faint" style={s.foot}>
        Cancelling costs nothing and is never shown on anyone&apos;s profile.
      </Text>
    </Screen>
  );
}

const s = themed(() =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  gap: { marginTop: space.md },
  back: { position: 'absolute', left: GUTTER - 4 },
  panel: {
    flex: 1,
    marginTop: -24,
    backgroundColor: color.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  body: { paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.xl, gap: space.md },
  sub: { marginTop: -space.sm },
  warn: { fontWeight: '600', marginTop: -space.xs },
  route: {
    backgroundColor: color.sunken,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  stop: { flexDirection: 'row', gap: space.md },
  stopGap: { paddingBottom: space.lg },
  rail: { width: 14, alignItems: 'center', paddingTop: 5 },
  railLine: { flex: 1, width: 2, backgroundColor: color.lineStrong, marginTop: 4 },
  dotStart: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.brand },
  dotEnd: { width: 12, height: 12, borderRadius: 2, backgroundColor: color.brand },
  dotMine: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.accent,
    borderWidth: 3,
    borderColor: color.surface,
  },
  driver: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  seatBadge: {
    backgroundColor: color.goSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  note: {
    borderLeftWidth: 3,
    borderLeftColor: color.lineStrong,
    paddingLeft: space.md,
    paddingVertical: space.xs,
  },
  foot: { marginTop: space.md },
  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    gap: space.xs,
  },
  checked: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: color.goSoft,
  },
  recoverTitle: { marginTop: space.xl },
  driverNote: { paddingVertical: space.md },
  })
);
