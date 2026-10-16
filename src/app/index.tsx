import { useRouter } from 'expo-router';
import type React from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/data/session';
import { seatsOpen, startName, useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import type { LngLat } from '@/lib/mapbox';
import { naira } from '@/lib/config';
import { useMyLocation } from '@/lib/location';
import { NEAR_PICKUP_M, pickupMetres } from '@/lib/nearby';
import { demoNow, hhmm, untilHeading, untilShort } from '@/lib/time';
import { useReminders } from '@/lib/reminders';
import { peekReturnTo, takeReturnTo } from '@/theme/theme';
import { color, currentScheme, elevation, GUTTER, LIME, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ChatIcon, ChevronIcon, PinIcon, PlusIcon } from '@/ui/icons';
import { Avatar, Button, SectionTitle } from '@/ui/primitives';
import { BottomSheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { TripMap, useRiderDrops } from '@/ui/trip-map';
import { TripRow } from '@/ui/trip-row';

/**
 * Home. The map fills the screen and a sheet sits over the bottom of it, the
 * way every ride hailing app works, so there is one place to look.
 *
 * What the sheet shows depends on who you are, and only on that. A passenger
 * sees rides going their way, or the seat they are holding. A driver sees the
 * ride they are offering, or a prompt to post one. Neither sees anything of
 * the other side: switching is a line in Account, not a button on this screen.
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
  const { role } = useStore();
  useReminders(role);

  // On the way back to Account, a plain page for the one frame this shows,
  // rather than the whole map mounting and flashing past.
  if (returning) return <View style={s.screen} />;

  const topBar = insets.top + 72;
  const collapsed = Math.round(height * 0.5);
  const expanded = height - topBar - space.sm;
  const layout = { topBar, collapsed, expanded, insetTop: insets.top };

  return role === 'driver' ? <DriverHome {...layout} /> : <PassengerHome {...layout} />;
}

type Layout = { topBar: number; collapsed: number; expanded: number; insetTop: number };

function PassengerHome({ topBar, collapsed, expanded, insetTop }: Layout) {
  const router = useRouter();
  const { trips, me, dropOff, dropOffName, serves, loading, mySeat } = useStore();
  const { tester } = useSession();
  const now = demoNow();

  const open = trips
    // Your own ride is hidden, except for testers, who book it to try both sides.
    .filter((t) => (t.status === 'posted' || t.status === 'boarding') && (tester || t.driverId !== me?.id))
    .sort((a, b) => a.departMin - b.departMin);
  // A ride is for you when you can walk to where it starts (within 1 km of
  // where this phone is now) and its road passes where you get off. Either
  // check is skipped while it cannot be made: no location yet, or no drop off
  // set. Rides that miss are still listed, lower down.
  const here = useMyLocation();
  const fits = (t: Trip) => {
    const m = pickupMetres(t, here);
    return (m === undefined || m <= NEAR_PICKUP_M) && (!dropOff || serves(t));
  };
  const checking = here !== null || dropOff !== null;
  const passing = open.filter(fits);
  const others = open.filter((t) => !fits(t));
  // A cancelled ride is not going anywhere, so nothing of it is drawn.
  const drawn = mySeat && mySeat.status !== 'cancelled' ? mySeat : undefined;

  return (
    <View style={s.screen}>
      <TripMap
        origin={drawn?.origin}
        destination={drawn?.destination}
        dropOff={dropOff}
        padding={{ top: topBar + space.xl, bottom: collapsed + space.lg, left: 40, right: 40 }}
        controlsBottom={collapsed + space.md}
      />

      <TopBar insetTop={insetTop}>
        <Pressable
          onPress={() => router.push('/find')}
          accessibilityRole="button"
          accessibilityLabel="Where you get off"
          style={({ pressed }) => [s.search, pressed && s.pressed]}>
          <PinIcon size={18} tint={color.brandInk} />
          <View style={s.flex}>
            {dropOff ? (
              <>
                <Text variant="kicker" style={s.searchLabel}>
                  Getting off at
                </Text>
                <Text variant="heading" numberOfLines={1} style={s.searchValue}>
                  {dropOffName}
                </Text>
              </>
            ) : (
              <Text variant="body" style={[s.searchValue, s.searchEmpty]}>
                Where are you getting off?
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
              title={
                mySeat.status === 'cancelled'
                  ? 'Ride cancelled'
                  : mySeat.status === 'left'
                    ? 'On your way'
                    : 'Your ride home'
              }
            />
          ) : (
            <SheetTitle
              title="Rides home"
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
          <MyRide trip={mySeat} now={now} />
        ) : (
          <Browse passing={passing} others={others} now={now} here={here} />
        )}
      </BottomSheet>
    </View>
  );
}

function DriverHome({ topBar, collapsed, expanded, insetTop }: Layout) {
  const router = useRouter();
  const { trips, me, loading, myTrip, underway } = useStore();
  const now = demoNow();

  // A ride that has already set off tonight still has one job left: the
  // drop offs, in order.
  const onTheWay = myTrip ? undefined : trips.find((t) => t.driverId === me?.id && underway(t));
  const shown = myTrip ?? onTheWay;
  // Everyone booked shows where they get off, numbered in drop off order.
  const drops = useRiderDrops(shown, shown?.riders ?? []);

  return (
    <View style={s.screen}>
      <TripMap
        origin={shown?.origin}
        destination={shown?.destination}
        riderDrops={drops}
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
            title={myTrip ? "You're driving" : onTheWay ? 'Have a good drive' : 'Driving tonight?'}
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
                : `${onTheWay.riders.length} on board. The drop offs are in order on the next screen.`}
            </Text>
            <Button
              label="See drop offs"
              kind="secondary"
              onPress={() => router.push({ pathname: '/pickup/[id]', params: { id: onTheWay.id } })}
            />
          </View>
        ) : (
          <View style={s.block}>
            <Text variant="body" tone="muted">
              Post the time you expect to leave and the seats you have. People
              going your way can then take one.
            </Text>
            <Button label="Post tonight's ride" onPress={() => router.push('/post')} arrow />
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
 * "This evening" before noon and "Tonight" after it, then the title, with an
 * optional count on the right.
 */
function SheetTitle({ title, aside }: { title: string; aside?: string }) {
  return (
    <View>
      <Text variant="kicker" tone="brand">
        {demoNow() < 12 * 60 ? 'This evening' : 'Tonight'}
      </Text>
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
  passing,
  others,
  now,
  here,
}: {
  passing: Trip[];
  others: Trip[];
  now: number;
  here: LngLat | null;
}) {
  const router = useRouter();
  const { dropOff, dropOffName } = useStore();
  const open = (id: string) => router.push({ pathname: '/trip/[id]', params: { id } });

  if (passing.length === 0 && others.length === 0) {
    return (
      <View style={s.empty}>
        <Text variant="heading">No rides posted yet</Text>
        <Text variant="small" tone="muted" style={s.emptyBody}>
          Rides usually start appearing from about 16:00. This list updates on
          its own.
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
            Set where you get off to see which rides pass it.
          </Text>
        </Pressable>
      ) : null}

      {!here ? (
        <Text variant="small" tone="muted" style={s.none}>
          Allow location to see which pickups are within walking distance. It stays on
          this phone.
        </Text>
      ) : null}

      {passing.map((t, i) => (
        // The soonest ride gets the button; the rest stay compact.
        <TripRow
          key={t.id}
          trip={t}
          now={now}
          pickupM={pickupMetres(t, here)}
          cta={i === 0 ? 'See this ride' : undefined}
          onPress={() => open(t.id)}
        />
      ))}

      {passing.length === 0 && others.length > 0 ? (
        <Text variant="small" tone="muted" style={s.none}>
          {here && dropOff
            ? `No ride starts within 1 km of you and passes ${dropOffName} yet.`
            : here
              ? 'No ride starts within 1 km of you yet.'
              : `Nothing passes ${dropOffName} yet.`}{' '}
          The rides below might still work for you.
        </Text>
      ) : null}

      {others.length > 0 ? (
        <>
          <SectionTitle>Other rides tonight</SectionTitle>
          {others.map((t) => (
            <TripRow key={t.id} trip={t} now={now} pickupM={pickupMetres(t, here)} dim onPress={() => open(t.id)} />
          ))}
        </>
      ) : null}

      <Text variant="small" tone="muted" center style={s.foot}>
        Most people book close to when they stand up to leave.
      </Text>
    </>
  );
}

/** The seat you are holding. Everything a rider needs before the gate. */
function MyRide({ trip, now }: { trip: Trip; now: number }) {
  const router = useRouter();
  const { person, me, markPresent, finishRide, dropOffName } = useStore();
  const driver = person(trip.driverId);
  const start = startName(trip);
  const here = !!(me && trip.presentAt[me.id]);
  const openTrip = () => router.push({ pathname: '/trip/[id]', params: { id: trip.id } });

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
              To {dropOffName}, with {driver.name.split(' ')[0]}
              {trip.destination ? `, who is heading for ${trip.destination.name}` : ''}
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

        <Button label="I have been dropped off" kind="go" onPress={() => finishRide(trip.id)} />
        <Button
          label="Message driver and riders"
          kind="secondary"
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
        />
      </View>
    );
  }

  return (
    <View style={s.block}>
      <View>
        <Text variant="dataLarge">{here ? 'You are checked in' : untilHeading(trip.departMin, now)}</Text>
        <Text variant="small" tone="muted">
          Leaves {hhmm(trip.departMin)}, give or take {trip.toleranceMin} min, from {start}
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

      {here ? null : (
        <Button
          label={`I am at ${start}`}
          kind="go"
          onPress={() => me && markPresent(trip.id, me.id)}
        />
      )}
      <Button
        label="Message driver and riders"
        kind="secondary"
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
      />
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
      <View style={s.pair}>
        <Button label="Edit ride" kind="secondary" style={s.flex} onPress={() => router.push('/post')} />
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
