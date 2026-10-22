import { useRouter } from 'expo-router';
import type React from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/data/session';
import { bookable, directionNow, directionWords, seatsOpen, startName, useStore } from '@/data/store';
import type { Direction, Trip } from '@/data/types';
import type { LngLat } from '@/lib/mapbox';
import { naira } from '@/lib/config';
import { askForLocation, useLocationAccess, useMyLocation } from '@/lib/location';
import { NEAR_PICKUP_M, pickupMetres } from '@/lib/nearby';
import { hhmm, untilHeading, untilShort, useNow } from '@/lib/time';
import { useReminders } from '@/lib/reminders';
import type { LivePoint } from '@/lib/live';
import { Text } from '@/ui/text';
import { peekReturnTo, takeReturnTo } from '@/theme/theme';
import { color, currentScheme, elevation, GUTTER, LIME, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ChatIcon, ChevronIcon, PinIcon, PlusIcon } from '@/ui/icons';
import { Avatar, Button, SectionTitle } from '@/ui/primitives';
import { BottomSheet } from '@/ui/sheet';
import { CarLine, LiveNotice, useLiveView } from '@/ui/live';
import { RecordingNotice } from '@/ui/recording-notice';
import { DirectionsButton, RidesMap, TripMap, useRiderDrops } from '@/ui/trip-map';
import { TripRow } from '@/ui/trip-row';

/**
 * Home. The map fills the screen and a sheet sits over the bottom of it, the
 * way every ride hailing app works, so there is one place to look.
 *
 * What the sheet shows depends on who you are, and only on that. A passenger
 * sees rides going their way, or the seat they are holding. A driver sees the
 * ride they are offering, or a prompt to post one. Neither sees anything of
 * the other side: switching is a line in Account, not a button on this screen.
 *
 * Both sides see one direction at a time, to work or home, with a switch at
 * the top of the sheet. It opens on whichever ride you have coming up, or on
 * the one the clock suggests.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A theme switch rebuilds every screen from here. Put the person back on
  // the page they switched it from. navigate, not push: it goes to the
  // Account page already there rather than stacking a second one, which is
  // what made back land on Account again.
  const [returning, setReturning] = useState(peekReturnTo);
  useEffect(() => {
    const back = takeReturnTo();
    if (back === '/you') router.navigate('/you');
    setReturning(false);
  }, [router]);
  const { height } = useWindowDimensions();
  const { role, trips, me, myTrip, mySeat, underway } = useStore();
  useReminders(role);
  const now = useNow();
  const [chosen, setChosen] = useState<Direction | null>(null);
  // What you have on, first: a ride on the road, then the next one waiting.
  const onTheRoad = trips.find((t) => underway(t) && (t.driverId === me?.id || t.riders.includes(me?.id ?? '')));
  const committed = role === 'driver' ? (onTheRoad ?? myTrip) : (mySeat ?? onTheRoad);
  const dir = chosen ?? committed?.direction ?? directionNow(now);

  // On the way back to Account, a plain page for the one frame this shows,
  // rather than the whole map mounting and flashing past.
  if (returning) return <View style={s.screen} />;

  const topBar = insets.top + 72;
  const collapsed = Math.round(height * 0.5);
  const expanded = height - topBar - space.sm;
  const layout = { topBar, collapsed, expanded, insetTop: insets.top, dir, onDir: setChosen };

  return role === 'driver' ? <DriverHome {...layout} /> : <PassengerHome {...layout} />;
}

type Layout = {
  topBar: number;
  collapsed: number;
  expanded: number;
  insetTop: number;
  dir: Direction;
  onDir: (d: Direction) => void;
};

function PassengerHome({ topBar, collapsed, expanded, insetTop, dir, onDir }: Layout) {
  const router = useRouter();
  const { trips, me, dropOff, dropOffName, serves, passesNear, loading, mySeatFor } = useStore();
  const { tester } = useSession();
  const now = useNow();
  const mySeat = mySeatFor(dir);
  const home = dir === 'home';

  const open = trips
    // Your own ride is hidden, except for testers, who book it to try both
    // sides. So is one well past its time that the driver never started.
    .filter((t) => t.direction === dir && bookable(t) && (tester || t.driverId !== me?.id))
    .sort((a, b) => a.departMin - b.departMin);
  // Home: a ride is for you when you can walk to where it starts (within 1 km
  // of where this phone is now) and its road passes where you get off. To
  // work: when its road passes where you are picked up, or where this phone
  // is until that is set. A check is skipped while it cannot be made. Rides
  // that miss are still listed, lower down.
  const here = useMyLocation();
  const fits = (t: Trip) => {
    if (!home) return dropOff ? serves(t) : here ? passesNear(t, here) : true;
    const m = pickupMetres(t, here);
    return (m === undefined || m <= NEAR_PICKUP_M) && (!dropOff || serves(t));
  };
  const checking = here !== null || dropOff !== null;
  const passing = open.filter(fits);
  const others = open.filter((t) => !fits(t));
  // A cancelled ride is not going anywhere, so nothing of it is drawn.
  const drawn = mySeat && mySeat.status !== 'cancelled' ? mySeat : undefined;
  const live = useLiveView(drawn);

  return (
    <View style={s.screen}>
      {drawn || loading ? (
        <TripMap
          origin={drawn?.origin}
          destination={drawn?.destination}
          dropOff={dropOff}
          live={live.markers}
          padding={{ top: topBar + space.xl, bottom: collapsed + space.lg, left: 40, right: 40 }}
          controlsBottom={collapsed + space.md}
        />
      ) : (
        // Choosing a ride: the ones that suit you, or every ride when none do.
        // The bottom padding clears the ride card as well as the sheet.
        <RidesMap
          trips={passing.length > 0 ? passing : others}
          dropOff={dropOff}
          padding={{ top: topBar + space.xl, bottom: collapsed + 84, left: 40, right: 40 }}
          controlsBottom={collapsed + space.md}
          onOpen={(id) => router.push({ pathname: '/trip/[id]', params: { id } })}
        />
      )}

      <TopBar insetTop={insetTop}>
        <Pressable
          onPress={() => router.push('/find')}
          accessibilityRole="button"
          accessibilityLabel={home ? 'Where you get off' : 'Where you are picked up'}
          style={({ pressed }) => [s.search, pressed && s.pressed]}>
          <PinIcon size={18} tint={color.brandInk} />
          <View style={s.flex}>
            {dropOff ? (
              <>
                <Text variant="kicker" style={s.searchLabel}>
                  {home ? 'Getting off at' : 'Picked up near'}
                </Text>
                <Text variant="heading" numberOfLines={1} style={s.searchValue}>
                  {dropOffName}
                </Text>
              </>
            ) : (
              <Text variant="body" style={[s.searchValue, s.searchEmpty]}>
                {home ? 'Where are you getting off?' : 'Where are you picked up?'}
              </Text>
            )}
          </View>
          <ChevronIcon size={18} tint={barColours().faint} />
        </Pressable>
      </TopBar>

      <BottomSheet
        collapsed={collapsed}
        expanded={expanded}
        header={
          mySeat ? (
            <SheetTitle
              dir={dir}
              onDir={onDir}
              title={
                mySeat.status === 'cancelled'
                  ? 'Ride cancelled'
                  : mySeat.status === 'left'
                    ? mySeat.direction === 'work' && !(me && mySeat.presentAt[me.id])
                      ? 'Your driver is coming'
                      : 'On your way'
                    : `Your ride ${directionWords(dir)}`
              }
            />
          ) : (
            <SheetTitle
              dir={dir}
              onDir={onDir}
              title={`Rides ${directionWords(dir)}`}
              aside={
                loading
                  ? 'Loading'
                  : checking
                    ? `${passing.length} ${passing.length === 1 ? 'suits' : 'suit'} you`
                    : `${open.length} posted so far`
              }
            />
          )
        }>
        <LoadError />
        {loading ? (
          <ActivityIndicator style={s.loading} color={color.inkFaint} />
        ) : mySeat ? (
          <MyRide trip={mySeat} now={now} car={live.car} />
        ) : (
          <Browse dir={dir} passing={passing} others={others} now={now} here={here} />
        )}
      </BottomSheet>
    </View>
  );
}

function DriverHome({ topBar, collapsed, expanded, insetTop, dir, onDir }: Layout) {
  const router = useRouter();
  const { trips, me, loading, myTripFor, underway } = useStore();
  const now = useNow();
  const myTrip = myTripFor(dir);
  const home = dir === 'home';

  // A ride that has already set off still has one job left: the drop offs,
  // in order, or in the morning the pickups.
  const onTheWay = myTrip
    ? undefined
    : trips.find((t) => t.driverId === me?.id && t.direction === dir && underway(t));
  const shown = myTrip ?? onTheWay;
  // Everyone booked shows their place, numbered in the order the road reaches it.
  const drops = useRiderDrops(shown, shown?.riders ?? []);
  // Once moving: home, only the people who got in have a drop off to drive
  // to; to work, only the people not picked up yet have a pickup.
  const aboardDrops = drops.filter((d) => (home ? onTheWay?.presentAt[d.id] : !onTheWay?.presentAt[d.id]));
  const toCollect = onTheWay ? onTheWay.riders.filter((r) => !onTheWay.presentAt[r]).length : 0;
  const live = useLiveView(shown);

  return (
    <View style={s.screen}>
      <TripMap
        origin={shown?.origin}
        destination={shown?.destination}
        riderDrops={drops}
        live={live.markers}
        padding={{ top: topBar + space.xl, bottom: collapsed + space.lg, left: 40, right: 40 }}
        controlsBottom={collapsed + space.md}
      />

      <TopBar insetTop={insetTop}>
        <View style={s.status}>
          <View style={[s.statusDot, myTrip || onTheWay ? s.statusLive : null]} />
          <Text variant="small" style={s.statusText}>
            {myTrip ? 'Your ride is live' : onTheWay ? 'On the way' : 'Not posted yet'}
          </Text>
        </View>
      </TopBar>

      <BottomSheet
        collapsed={collapsed}
        expanded={expanded}
        header={
          <SheetTitle
            dir={dir}
            onDir={onDir}
            title={
              myTrip
                ? "You're driving"
                : onTheWay
                  ? 'Have a good drive'
                  : home
                    ? 'Driving home tonight?'
                    : 'Driving to work?'
            }
          />
        }>
        <LoadError />
        {loading ? (
          <ActivityIndicator style={s.loading} color={color.inkFaint} />
        ) : myTrip ? (
          <MyOffer trip={myTrip} now={now} />
        ) : onTheWay ? (
          <View style={s.block}>
            <Text variant="body" tone="muted">
              {onTheWay.riders.length === 0
                ? 'Nobody came along this time.'
                : home
                  ? `${onTheWay.riders.length} on board. The drop offs are in order on the next screen.`
                  : toCollect > 0
                    ? `${toCollect} still to pick up. The pickups are in order on the next screen.`
                    : `Everyone is in. Next stop, ${onTheWay.destination?.name ?? 'work'}.`}
            </Text>
            <Button
              label={home ? 'See drop offs' : 'See pickups'}
              kind="secondary"
              onPress={() => router.push({ pathname: '/pickup/[id]', params: { id: onTheWay.id } })}
            />
            <DirectionsButton trip={onTheWay} drops={aboardDrops} />
            <LiveNotice trip={onTheWay} />
          </View>
        ) : (
          <View style={s.block}>
            <Text variant="body" tone="muted">
              {home
                ? 'Post the time you expect to leave and the seats you have. People going your way can then take one.'
                : 'Post when you leave home and the seats you have. People along your road, going your way, can then take one.'}
            </Text>
            <Button
              label={home ? 'Post your ride home' : 'Post your ride to work'}
              onPress={() => router.push({ pathname: '/post', params: { direction: dir } })}
              arrow
            />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

/** Your initials, top left, into Account. Whatever else the top bar holds sits beside it. */
function TopBar({ insetTop, children }: { insetTop: number; children: React.ReactNode }) {
  const router = useRouter();
  const { me } = useStore();
  return (
    <View style={[s.top, { paddingTop: insetTop + space.sm }]} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/you')}
        accessibilityRole="button"
        accessibilityLabel="Your account"
        style={({ pressed }) => [s.me, pressed && s.pressed]}>
        <Avatar initials={me?.initials ?? '?'} size={52} tone="me" />
      </Pressable>
      {children}
    </View>
  );
}

function LoadError() {
  const { error, refresh } = useStore();
  if (!error) return null;
  return (
    <Pressable onPress={refresh} style={s.error} accessibilityRole="button">
      <AlertIcon size={18} />
      <Text variant="small" tone="stop" style={s.flex}>
        {error}
      </Text>
    </Pressable>
  );
}

/**
 * The way you are looking, to work or home, as a switch; then the title,
 * with an optional count on the right.
 */
function SheetTitle({
  title,
  aside,
  dir,
  onDir,
}: {
  title: string;
  aside?: string;
  dir: Direction;
  onDir: (d: Direction) => void;
}) {
  return (
    <View>
      <View style={s.ways} accessibilityRole="tablist">
        {(['work', 'home'] as const).map((d) => (
          <Pressable
            key={d}
            onPress={() => onDir(d)}
            accessibilityRole="tab"
            accessibilityState={{ selected: d === dir }}
            hitSlop={6}
            style={[s.way, d === dir && s.wayOn]}>
            <Text variant="small" style={[s.wayText, d === dir && s.wayTextOn]}>
              {d === 'work' ? 'To work' : 'Home'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={s.titleRow}>
        <Text variant="title" style={s.flex} numberOfLines={1}>
          {title}
        </Text>
        {aside ? (
          <Text variant="small" tone="muted" style={s.aside} numberOfLines={1}>
            {aside}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Browse({
  dir,
  passing,
  others,
  now,
  here,
}: {
  dir: Direction;
  passing: Trip[];
  others: Trip[];
  now: number;
  here: LngLat | null;
}) {
  const router = useRouter();
  const { dropOff, dropOffName } = useStore();
  const access = useLocationAccess();
  const open = (id: string) => router.push({ pathname: '/trip/[id]', params: { id } });
  const home = dir === 'home';
  // How far to walk to the start only matters when everyone meets there.
  const walk = (t: Trip) => (home ? pickupMetres(t, here) : undefined);

  if (passing.length === 0 && others.length === 0) {
    return (
      <View style={s.empty}>
        <Text variant="heading">No rides posted yet</Text>
        <Text variant="small" tone="muted" style={s.emptyBody}>
          {home
            ? 'Rides home usually start appearing from about 16:00.'
            : 'Rides to work are posted the same morning, from about 05:30.'}{' '}
          This list updates on its own.
        </Text>
      </View>
    );
  }

  return (
    <>
      {!dropOff ? (
        <Pressable onPress={() => router.push('/find')} style={s.hint} accessibilityRole="button">
          <PinIcon size={18} tint={color.accentInk} />
          <Text variant="small" tone="accent" style={s.flex}>
            {home
              ? 'Set where you get off to see which rides pass it.'
              : 'Set where you are picked up to see which rides pass it.'}
          </Text>
        </Pressable>
      ) : null}

      {/*
        Only after a "no". While the first fix is coming in there is nothing
        to say, and allowing it is a tap away rather than a dead sentence.
      */}
      {home && !here && (access === 'denied' || access === 'blocked') ? (
        <Pressable onPress={askForLocation} style={s.none} accessibilityRole="button">
          <Text variant="small" tone="muted">
            Location is off, so pickups are not sorted by distance. It stays on this phone.{' '}
            <Text variant="small" tone="brand" style={s.link}>
              {access === 'blocked' ? 'Turn it on in Settings' : 'Allow location'}
            </Text>
          </Text>
        </Pressable>
      ) : null}

      {passing.map((t, i) => (
        // The soonest ride gets the button; the rest stay compact.
        <TripRow
          key={t.id}
          trip={t}
          now={now}
          pickupM={walk(t)}
          cta={i === 0 ? 'See this ride' : undefined}
          onPress={() => open(t.id)}
        />
      ))}

      {passing.length === 0 && others.length > 0 ? (
        <Text variant="small" tone="muted" style={s.none}>
          {!home
            ? dropOff
              ? `Nothing passes ${dropOffName} yet.`
              : 'Nothing passes near you yet.'
            : here && dropOff
              ? `No ride starts within 1 km of you and passes ${dropOffName} yet.`
              : here
                ? 'No ride starts within 1 km of you yet.'
                : `Nothing passes ${dropOffName} yet.`}{' '}
          The rides below might still work for you.
        </Text>
      ) : null}

      {others.length > 0 ? (
        <>
          <SectionTitle>{home ? 'Other rides tonight' : 'Other rides this morning'}</SectionTitle>
          {others.map((t) => (
            <TripRow key={t.id} trip={t} now={now} pickupM={walk(t)} dim onPress={() => open(t.id)} />
          ))}
        </>
      ) : null}

      <Text variant="small" tone="muted" center style={s.foot}>
        {home
          ? 'Most people book close to when they stand up to leave.'
          : 'The driver picks you up on the way, near where you set your pickup.'}
      </Text>
    </>
  );
}

/** The seat you are holding. Everything a rider needs before the gate. */
function MyRide({ trip, now, car }: { trip: Trip; now: number; car: LivePoint | undefined }) {
  const router = useRouter();
  const { person, me, markPresent, finishRide, dropOffName } = useStore();
  const driver = person(trip.driverId);
  const start = startName(trip);
  const here = !!(me && trip.presentAt[me.id]);
  const openTrip = () => router.push({ pathname: '/trip/[id]', params: { id: trip.id } });
  const work = trip.direction === 'work';

  // Moving on puts the list of rides back on this screen. The cancelled ride
  // stays out of the way for the rest of the evening.
  if (trip.status === 'cancelled') {
    return (
      <View style={s.block}>
        <Text variant="body" tone="muted">
          {driver.name.split(' ')[0]} cancelled. Other rides may still have seats.
        </Text>
        <Button label="Find another ride" onPress={() => finishRide(trip.id)} arrow />
      </View>
    );
  }

  // A morning driver on the way to collect this rider: where the car is, and
  // the way to say they are in.
  if (trip.status === 'left' && work && !here) {
    return (
      <View style={s.block}>
        <View style={s.underway}>
          <View style={s.underwayDot} />
          <View style={s.flex}>
            <Text variant="dataLarge">On the way to you</Text>
            <Text variant="small" tone="muted">
              {driver.name.split(' ')[0]} has set off and picks you up near {dropOffName}
            </Text>
          </View>
        </View>
        <CarLine trip={trip} car={car} />
        <Button label="I am in the car" kind="go" onPress={() => me && markPresent(trip.id, me.id)} />
        <Button
          label="Message driver and riders"
          kind="secondary"
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
        />
        <LiveNotice trip={trip} />
      </View>
    );
  }

  // The car has set off with this rider in it. What they need now: who is
  // driving, where they are being taken, and a way to say they are out.
  if (trip.status === 'left') {
    return (
      <View style={s.block}>
        <View style={s.underway}>
          <View style={s.underwayDot} />
          <View style={s.flex}>
            <Text variant="dataLarge">On the way</Text>
            <Text variant="small" tone="muted">
              {work
                ? `To ${trip.destination?.name ?? 'work'}, with ${driver.name.split(' ')[0]}`
                : `To ${dropOffName}, with ${driver.name.split(' ')[0]}${trip.destination ? `, who is heading for ${trip.destination.name}` : ''}`}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={openTrip}
          style={s.driver}
          accessibilityRole="button"
          accessibilityLabel={`${driver.name}, ${trip.vehicle || 'car not described'}. Ride details`}>
          <Avatar initials={driver.initials} size={48} />
          <View style={s.flex}>
            <Text variant="heading">{driver.name}</Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {trip.vehicle || 'Car not described'}
            </Text>
          </View>
          <Text variant="small" tone="brand" style={s.link}>
            Details
          </Text>
        </Pressable>

        <Button
          label={work ? 'I have arrived' : 'I have been dropped off'}
          kind="go"
          onPress={() => finishRide(trip.id)}
        />
        <Button
          label="Message driver and riders"
          kind="secondary"
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
        />
        <RecordingNotice />
      </View>
    );
  }

  return (
    <View style={s.block}>
      <View>
        <Text variant="dataLarge">
          {here ? (work ? 'You are in the car' : 'You are checked in') : untilHeading(trip.departMin, now)}
        </Text>
        <Text variant="small" tone="muted">
          {work
            ? `Leaves ${start} at ${hhmm(trip.departMin)}, give or take ${trip.toleranceMin} min, and picks you up near ${dropOffName} on the way`
            : `Leaves ${hhmm(trip.departMin)}, give or take ${trip.toleranceMin} min, from ${start}`}
        </Text>
        {trip.contributionNaira ? (
          <Text variant="small" tone="ink" style={s.link}>
            {naira(trip.contributionNaira)} to {driver.name.split(' ')[0]} when you get in, cash or transfer
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={openTrip}
        style={s.driver}
        accessibilityRole="button"
        accessibilityLabel={`${driver.name}, ${trip.vehicle || 'car not described yet'}. Ride details`}>
        <Avatar initials={driver.initials} size={48} />
        <View style={s.flex}>
          <Text variant="heading">{driver.name}</Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {trip.vehicle || 'Car not described yet'}
          </Text>
        </View>
        <Text variant="small" tone="brand" style={s.link}>
          Details
        </Text>
      </Pressable>

      <CarLine trip={trip} car={car} />

      {/* To work, the driver collects you after setting off, and says so then. */}
      {here || work ? null : (
        <Button label={`I am at ${start}`} kind="go" onPress={() => me && markPresent(trip.id, me.id)} />
      )}
      <Button
        label="Message driver and riders"
        kind="secondary"
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
      />
      <LiveNotice trip={trip} />
    </View>
  );
}

/** The ride you are offering. When, who is coming, and the way to the start. */
function MyOffer({ trip, now }: { trip: Trip; now: number }) {
  const router = useRouter();
  const { person } = useStore();
  const left = seatsOpen(trip);
  const names = trip.riders.map((r) => person(r).name.split(' ')[0]).join(', ');
  // Three or four faces next to the count leave it no room on a narrow phone.
  const face = trip.riders.length > 2 ? 34 : 44;

  const stats = [
    { label: 'Leaving', value: hhmm(trip.departMin) },
    { label: 'Window', value: `±${trip.toleranceMin} min` },
    { label: 'In', value: untilShort(trip.departMin, now) },
  ];

  return (
    <View style={s.block}>
      <View style={s.stats}>
        {stats.map((st) => (
          <View key={st.label} style={s.stat}>
            <Text variant="small" tone="muted">
              {st.label}
            </Text>
            <Text variant="dataLarge" numberOfLines={1} adjustsFontSizeToFit style={s.statValue}>
              {st.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={s.seatCard}>
        {trip.riders.length === 0 ? (
          <View style={s.openSeat}>
            <PlusIcon size={22} tint={color.inkMuted} />
          </View>
        ) : (
          <View style={s.riders}>
            {trip.riders.map((r) => (
              <Avatar key={r} initials={person(r).initials} size={face} tone={trip.presentAt[r] ? 'go' : 'person'} />
            ))}
          </View>
        )}
        <View style={s.flex}>
          <Text variant="heading">
            {trip.riders.length} of {trip.seatsTotal} {trip.seatsTotal === 1 ? 'seat' : 'seats'} taken
          </Text>
          <Text variant="small" tone="muted" numberOfLines={2}>
            {trip.riders.length === 0
              ? "You'll get a ping when someone books."
              : left === 0
                ? `Full. ${names}`
                : names}
          </Text>
        </View>
      </View>

      <Text variant="small" tone="muted">
        {trip.contributionNaira
          ? `Each rider pays you ${naira(trip.contributionNaira)} directly, in cash or by transfer.`
          : 'A free ride. Riders pay nothing.'}
      </Text>

      <Button
        label="Go to pickup"
        onPress={() => router.push({ pathname: '/pickup/[id]', params: { id: trip.id } })}
        arrow
      />
      <LiveNotice trip={trip} />

      <View style={s.pair}>
        <Button
          label="Edit ride"
          kind="secondary"
          style={s.flex}
          onPress={() => router.push({ pathname: '/post', params: { id: trip.id } })}
        />
        {trip.riders.length > 0 ? (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
            accessibilityRole="button"
            accessibilityLabel="Message riders"
            style={({ pressed }) => [s.iconButton, pressed && s.pressed]}>
            <ChatIcon tint={color.brandInk} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/*
  The top bar floats on the map, which is Mapbox's light style by day and its
  dark style at night. By day it is a white card; at night, dark glass.
*/
function barColours() {
  return currentScheme() === 'dark'
    ? { ink: '#F5F5F2', faint: '#93A39A', glass: 'rgba(20,38,31,0.92)', edge: 'rgba(255,255,255,0.12)' }
    : { ink: color.ink, faint: color.inkMuted, glass: color.surface, edge: color.line };
}

const s = themed(() => {
  const BAR = barColours();
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: GUTTER - 4,
  },
  me: { borderRadius: 16 },
  search: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: BAR.glass,
    borderWidth: 1,
    borderColor: BAR.edge,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: 6,
    ...elevation,
  },
  searchLabel: { color: BAR.faint, fontSize: 10, lineHeight: 13 },
  searchValue: { color: BAR.ink },
  searchEmpty: { color: BAR.faint, fontWeight: '600' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    backgroundColor: BAR.glass,
    borderWidth: 1,
    borderColor: BAR.edge,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    ...elevation,
  },
  statusText: { color: BAR.ink, fontWeight: '700' },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BAR.faint },
  // Lime disappears on white, so by day the live dot is pine.
  statusLive: { backgroundColor: currentScheme() === 'dark' ? LIME : color.brand },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  ways: { flexDirection: 'row', gap: space.xs, marginBottom: space.xs },
  way: {
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
  },
  wayOn: { backgroundColor: color.brand, borderColor: color.brand },
  wayText: { fontWeight: '700', color: color.inkMuted },
  wayTextOn: { color: color.onInk },
  aside: { fontWeight: '600', maxWidth: '45%' },
  foot: { marginTop: space.sm, marginBottom: space.md },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: 2,
  },
  statValue: { fontSize: 22, lineHeight: 27 },
  seatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: space.lg,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.stopSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  loading: { marginTop: space.xl },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.accentSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.xs,
  },
  none: { paddingVertical: space.md },
  empty: { paddingTop: space.lg, gap: space.sm },
  emptyBody: { marginBottom: space.md },
  block: { gap: space.md, paddingTop: space.xs },
  driver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
  },
  link: { fontWeight: '600' },
  underway: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.brandSoft,
  },
  underwayDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: color.accent,
    borderWidth: 3,
    borderColor: color.brand,
  },
  riders: { flexDirection: 'row', gap: space.xs },
  openSeat: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pair: { flexDirection: 'row', gap: space.sm },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
});
