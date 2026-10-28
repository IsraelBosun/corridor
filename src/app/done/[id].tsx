import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { endName, startName, useAnyTrip, useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { naira } from '@/lib/config';
import { clock } from '@/lib/time';
import { color, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, CheckIcon } from '@/ui/icons';
import { Button, Callout, Row, Screen } from '@/ui/primitives';
import { Text } from '@/ui/text';

/**
 * Ride complete. Shown once, after "I have been dropped off", "I have
 * arrived" or the car owner's "Everyone is dropped off", so the ride ends on
 * a screen that says so instead of the home list simply coming back.
 *
 * A short summary, a way to report a problem while it is fresh, and after a
 * morning ride a nudge towards the ride home.
 */
export default function DoneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { trip, loading } = useAnyTrip(id);
  const { me, role } = useStore();

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen footer={<Button label="Done" onPress={done} />}>
      <View style={s.tick}>
        <CheckIcon size={30} tint={color.go} />
      </View>
      {!trip ? (
        loading ? (
          <ActivityIndicator color={color.inkFaint} />
        ) : (
          <Text variant="title" center>
            Ride complete
          </Text>
        )
      ) : role === 'driver' && trip.driverId === me?.id ? (
        <OwnerSummary trip={trip} />
      ) : (
        <RiderSummary trip={trip} />
      )}
    </Screen>
  );
}

function RiderSummary({ trip }: { trip: Trip }) {
  const router = useRouter();
  const { person, dropOffName } = useStore();
  const first = person(trip.driverId).name.split(' ')[0];
  const work = trip.direction === 'work';

  return (
    <>
      <Text variant="title" center>
        You have arrived
      </Text>
      <Text variant="body" tone="muted" center style={s.sub}>
        {work ? `At ${endName(trip)}, with ${first}.` : `At ${dropOffName}, with ${first}.`} Thanks for riding.
      </Text>

      <View style={s.card}>
        <Row title="Car owner" value={person(trip.driverId).name} />
        <Row title="Left at" value={clock(trip.departMin)} />
        <Row
          title={work ? 'Picked up near' : 'From'}
          value={work ? dropOffName : startName(trip)}
        />
        <Row title="To" value={work ? endName(trip) : dropOffName} />
        <Row
          title="Fuel contribution"
          value={trip.contributionNaira ? naira(trip.contributionNaira) : 'Free'}
          last
        />
      </View>

      {work ? (
        <Callout>
          <Text variant="body" style={s.bold}>
            Need a ride home tonight?
          </Text>
          <Text variant="small" tone="muted">
            Rides home are posted from about 4 PM. Book one when you are ready to leave.
          </Text>
        </Callout>
      ) : null}

      <Row
        icon={<AlertIcon />}
        title="Report a problem"
        subtitle="About the car owner, a rider, or the ride. Nobody is told who reported."
        onPress={() => router.push({ pathname: '/report/[id]', params: { id: trip.id } })}
        tone="stop"
        last
      />
    </>
  );
}

function OwnerSummary({ trip }: { trip: Trip }) {
  const router = useRouter();
  const { person } = useStore();
  const work = trip.direction === 'work';
  // Only the people who actually got in. A booked rider who never showed up
  // did not ride.
  const rode = trip.riders.filter((r) => trip.presentAt[r]);
  const names = rode.map((r) => person(r).name.split(' ')[0]).join(', ');

  return (
    <>
      <Text variant="title" center>
        Ride complete
      </Text>
      <Text variant="body" tone="muted" center style={s.sub}>
        {rode.length === 0
          ? 'You drove alone this time. Thanks for offering the seats.'
          : `You took ${rode.length} ${rode.length === 1 ? 'colleague' : 'colleagues'} ${work ? 'to work' : 'home'}. Thanks for driving.`}
      </Text>

      <View style={s.card}>
        <Row title="Left at" value={clock(trip.departMin)} />
        <Row title="From" value={startName(trip)} />
        <Row title="To" value={endName(trip)} />
        <Row title="Riders" value={rode.length === 0 ? 'None' : names} last={!trip.contributionNaira} />
        {trip.contributionNaira ? (
          <Row title="Fuel contribution" value={`${naira(trip.contributionNaira)} each`} last />
        ) : null}
      </View>

      {work ? (
        <Callout>
          <Text variant="body" style={s.bold}>
            Driving home tonight?
          </Text>
          <Text variant="small" tone="muted">
            Post it now and colleagues going your way can book a seat during the day.
          </Text>
          <Button
            label="Post your ride home"
            kind="secondary"
            style={s.nudge}
            onPress={() => router.replace({ pathname: '/post', params: { direction: 'home' } })}
          />
        </Callout>
      ) : null}

      <Row
        icon={<AlertIcon />}
        title="Report a problem"
        subtitle="About a rider or the ride. Nobody is told who reported."
        onPress={() => router.push({ pathname: '/report/[id]', params: { id: trip.id } })}
        tone="stop"
        last
      />
    </>
  );
}

const s = themed(() =>
  StyleSheet.create({
  tick: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.goSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
    marginBottom: space.md,
  },
  sub: { marginTop: space.xs, marginBottom: space.lg },
  bold: { fontWeight: '600' },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  nudge: { marginTop: space.md },
  })
);
