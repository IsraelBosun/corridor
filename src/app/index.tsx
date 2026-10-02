import { useRouter } from 'expo-router';
import type React from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { seatsOpen, useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { demoNow, hhmm, untilText } from '@/lib/time';
import { peekReturnTo, takeReturnTo } from '@/theme/theme';
import { color, elevation, GUTTER, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ChatIcon, PinIcon } from '@/ui/icons';
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

  // On the way back to Account, a plain page for the one frame this shows,
  // rather than the whole map mounting and flashing past.
  if (returning) return <View style={s.screen} />;

  const topBar = insets.top + 64;
  const collapsed = Math.round(height * 0.44);
  const expanded = height - topBar - space.sm;
  const layout = { topBar, collapsed, expanded, insetTop: insets.top };

  return role === 'driver' ? <DriverHome {...layout} /> : <PassengerHome {...layout} />;
}

type Layout = { topBar: number; collapsed: number; expanded: number; insetTop: number };

function PassengerHome({ topBar, collapsed, expanded, insetTop }: Layout) {
  const router = useRouter();
  const { trips, me, landmarks, dropOff, dropOffName, serves, loading, mySeat } = useStore();
  const now = demoNow();

  const open = trips
    .filter((t) => (t.status === 'posted' || t.status === 'boarding') && t.driverId !== me?.id)
    .sort((a, b) => a.departMin - b.departMin);
  const passing = dropOff ? open.filter(serves) : open;
  const others = dropOff ? open.filter((t) => !serves(t)) : [];

  return (
    <View style={s.screen}>
      <TripMap
        stops={mySeat ? mySeat.stops : landmarks.map((l) => l.id)}
        destination={mySeat?.destination}
        dropOff={dropOff}
        showStops={!!mySeat}
        padding={{ top: topBar + space.xl, bottom: collapsed + space.lg, left: 40, right: 40 }}
        controlsBottom={collapsed + space.md}
      />

      <TopBar insetTop={insetTop}>
        <Pressable
          onPress={() => router.push('/find')}
          accessibilityRole="button"
          accessibilityLabel="Where you get off"
          style={({ pressed }) => [s.search, pressed && s.pressed]}>
          <PinIcon tint={dropOff ? color.accent : color.inkMuted} />
          <View style={s.flex}>
            {dropOff ? (
              <>
                <Text variant="small" tone="muted" style={s.searchLabel}>
                  Getting off at
                </Text>
                <Text variant="body" numberOfLines={1} style={s.searchValue}>
                  {dropOffName}
                </Text>
              </>
            ) : (
              <Text variant="body" tone="muted" style={s.searchValue}>
                Where are you getting off?
              </Text>
            )}
          </View>
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
                  ? 'Your ride was cancelled'
                  : mySeat.status === 'left'
                    ? 'On your way'
                    : 'Your ride'
              }
            />
          ) : (
            <View>
              <Text variant="title">Rides tonight</Text>
              <Text variant="small" tone="brand" style={s.link}>
                {loading
                  ? 'Loading'
                  : dropOff
                    ? passing.length === 1
                      ? `1 ride passes ${dropOffName}`
                      : `${passing.length} rides pass ${dropOffName}`
                    : `${open.length} posted so far`}
              </Text>
            </View>
          )
        }>
        <LoadError />
        {loading ? (
          <ActivityIndicator style={s.loading} color={color.inkFaint} />
        ) : mySeat ? (
          <MyRide trip={mySeat} now={now} />
        ) : (
          <Browse passing={passing} others={others} now={now} />
        )}
      </BottomSheet>
    </View>
  );
}

function DriverHome({ topBar, collapsed, expanded, insetTop }: Layout) {
  const router = useRouter();
  const { trips, me, landmarks, loading, myTrip, underway } = useStore();
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
        stops={shown ? shown.stops : landmarks.map((l) => l.id)}
        destination={shown?.destination}
        riderDrops={drops}
        showStops={!!shown}
        padding={{ top: topBar + space.xl, bottom: collapsed + space.lg, left: 40, right: 40 }}
        controlsBottom={collapsed + space.md}
      />

      <TopBar insetTop={insetTop}>
        <View style={s.status}>
          <View style={[s.statusDot, myTrip ? s.statusLive : null]} />
          <Text variant="body" style={s.searchValue}>
            {myTrip ? 'Your ride is posted' : onTheWay ? 'On the way' : 'Not posted tonight'}
          </Text>
        </View>
      </TopBar>

      <BottomSheet
        collapsed={collapsed}
        expanded={expanded}
        header={
          <SheetTitle
            title={myTrip ? 'You are driving tonight' : onTheWay ? 'Have a good drive' : 'Driving tonight?'}
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
              Post the time you expect to leave and the seats you have. Colleagues
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
        <Avatar initials={me?.initials ?? '?'} size={44} tone="ink" />
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

function SheetTitle({ title }: { title: string }) {
  return <Text variant="title">{title}</Text>;
}

function Browse({ passing, others, now }: { passing: Trip[]; others: Trip[]; now: number }) {
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

      {passing.map((t) => (
        <TripRow key={t.id} trip={t} now={now} onPress={() => open(t.id)} />
      ))}

      {dropOff && passing.length === 0 ? (
        <Text variant="small" tone="muted" style={s.none}>
          Nothing passes {dropOffName} yet. The rides below go elsewhere on the
          corridor.
        </Text>
      ) : null}

      {others.length > 0 ? (
        <>
          <SectionTitle>{`Not passing ${dropOffName}`}</SectionTitle>
          {others.map((t) => (
            <TripRow key={t.id} trip={t} now={now} dim onPress={() => open(t.id)} />
          ))}
        </>
      ) : null}
    </>
  );
}

/** The seat you are holding. Everything a rider needs before the gate. */
function MyRide({ trip, now }: { trip: Trip; now: number }) {
  const router = useRouter();
  const { person, landmark, me, markPresent, finishRide, dropOffName } = useStore();
  const driver = person(trip.driverId);
  const pickup = landmark(trip.stops[0]);
  const here = !!(me && trip.presentAt[me.id]);
  const openTrip = () => router.push({ pathname: '/trip/[id]', params: { id: trip.id } });

  if (trip.status === 'cancelled') {
    return (
      <View style={s.block}>
        <Text variant="body" tone="muted">
          {driver.name.split(' ')[0]} cancelled. Other rides may still have seats.
        </Text>
        <Button label="Find another ride" onPress={openTrip} />
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

        <Pressable onPress={openTrip} style={s.driver} accessibilityRole="button">
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
        <Text variant="dataLarge">{here ? 'You are checked in' : untilText(trip.departMin, now)}</Text>
        <Text variant="small" tone="muted">
          Leaves {hhmm(trip.departMin)}, give or take {trip.toleranceMin} min, from {pickup.name}
        </Text>
      </View>

      <Pressable onPress={openTrip} style={s.driver} accessibilityRole="button">
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
          label={`I am at ${pickup.name}`}
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

/** The ride you are offering. Who is coming, and the way to the pickup. */
function MyOffer({ trip, now }: { trip: Trip; now: number }) {
  const router = useRouter();
  const { person } = useStore();
  const left = seatsOpen(trip);

  return (
    <View style={s.block}>
      <View>
        <Text variant="dataLarge">
          {trip.riders.length} of {trip.seatsTotal} seats taken
        </Text>
        <Text variant="small" tone="muted">
          Leaving {hhmm(trip.departMin)}, give or take {trip.toleranceMin} min, {untilText(trip.departMin, now)}
        </Text>
      </View>

      <View style={s.riders}>
        {trip.riders.map((r) => (
          <View key={r} style={s.rider}>
            <Avatar initials={person(r).initials} size={44} tone={trip.presentAt[r] ? 'go' : 'person'} />
            <Text variant="small" tone="muted" numberOfLines={1} style={s.riderName}>
              {person(r).name.split(' ')[0]}
            </Text>
          </View>
        ))}
        {Array.from({ length: left }).map((_, i) => (
          <View key={`open-${i}`} style={s.rider}>
            <View style={s.openSeat} />
            <Text variant="small" tone="faint" style={s.riderName}>
              Open
            </Text>
          </View>
        ))}
      </View>

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

const s = themed(() =>
  StyleSheet.create({
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
  me: { borderRadius: 22, ...elevation },
  search: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 6,
    ...elevation,
  },
  searchLabel: { fontSize: 12, lineHeight: 15 },
  searchValue: { fontWeight: '600' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    ...elevation,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
  statusLive: { backgroundColor: color.go },
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
  riders: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, paddingVertical: space.sm },
  rider: { alignItems: 'center', width: 56, gap: 4 },
  riderName: { fontSize: 12 },
  openSeat: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  pair: { flexDirection: 'row', gap: space.sm },
  iconButton: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: color.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  })
);
