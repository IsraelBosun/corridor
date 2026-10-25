import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStore } from '@/data/store';
import type { Trip } from '@/data/types';
import { ageText, setPaused, useRidePositions, usePaused, useSharingRide, type LivePoint } from '@/lib/live';
import { metresBetween, type LngLat } from '@/lib/mapbox';
import { distanceText } from '@/lib/nearby';
import { useNow } from '@/lib/time';
import { color, radius, space, themed } from '@/theme/tokens';
import type { LiveMarker } from './trip-map';
import { Text } from './text';

/** Closer than this to the pickup counts as there: GPS is not more exact. */
export const AT_PICKUP_M = 150;

/** Where a rider is collected: the start in the evening, their own place in the morning. */
export function pickupPointOf(trip: Trip, place: { lat?: number; lng?: number } | undefined): LngLat | undefined {
  if (trip.direction === 'home') return trip.origin ? { lat: trip.origin.lat, lng: trip.origin.lng } : undefined;
  return typeof place?.lat === 'number' && typeof place?.lng === 'number' ? { lat: place.lat, lng: place.lng } : undefined;
}

/**
 * The others on this ride, live, as this person may see them: the car for a
 * rider, each waiting rider for the driver.
 */
export function useLiveView(trip: Trip | undefined): {
  markers: LiveMarker[];
  car: LivePoint | undefined;
  riders: Record<string, LivePoint>;
} {
  const { person, me } = useStore();
  const points = useRidePositions(trip);
  return useMemo(() => {
    const riders: Record<string, LivePoint> = {};
    let car: LivePoint | undefined;
    const markers: LiveMarker[] = [];
    if (!trip) return { markers, car, riders };
    for (const p of points) {
      if (p.id === trip.driverId && p.id !== me?.id) {
        car = p;
        markers.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'car' });
      } else if (trip.riders.includes(p.id)) {
        riders[p.id] = p;
        markers.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'person', initials: person(p.id).initials });
      }
    }
    return { markers, car, riders };
  }, [trip, points, person, me]);
}

/** For a rider: where the car is, against where they get in. */
export function CarLine({ trip, car }: { trip: Trip; car: LivePoint | undefined }) {
  const { person, dropOff } = useStore();
  useNow();
  if (!car) return null;
  const first = person(trip.driverId).name.split(' ')[0];
  const pickup = pickupPointOf(trip, dropOff ?? undefined);
  const m = pickup ? metresBetween(car, pickup) : undefined;
  const where =
    m === undefined
      ? 'is sharing where the car is'
      : m <= AT_PICKUP_M
        ? 'is at the pickup'
        : `is ${distanceText(m)} from ${trip.direction === 'work' ? 'your pickup' : 'the pickup'}`;
  return (
    <View style={s.line}>
      <View style={s.carDot}>
        <View style={s.carInner} />
      </View>
      <Text variant="small" style={s.flex}>
        <Text variant="small" style={s.bold}>
          {first} {where}
        </Text>
        <Text variant="small" tone="muted">
          {`, ${ageText(car.at)}`}
        </Text>
      </Text>
    </View>
  );
}

/** For a driver: one rider's line under their name. */
export function riderLiveText(trip: Trip, place: { lat?: number; lng?: number } | undefined, point: LivePoint | undefined): string | undefined {
  if (!point) return undefined;
  const pickup = pickupPointOf(trip, place);
  const m = pickup ? metresBetween(point, pickup) : undefined;
  const age = ageText(point.at);
  if (m === undefined) return `Sharing where they are, ${age}`;
  if (m <= AT_PICKUP_M) return `At the pickup, ${age}`;
  return `${distanceText(m)} from the pickup, ${age}`;
}

/**
 * Said wherever this phone is sharing its position with a ride, with the way
 * to stop. Nobody is shown on someone else's map without being told.
 */
export function LiveNotice({ trip }: { trip: Trip }) {
  const sharing = useSharingRide();
  const off = usePaused(trip.id);
  if (!sharing || sharing.trip.id !== trip.id) return null;
  const who = sharing.driving
    ? 'Riders on this ride see where your car is'
    : 'Your car owner sees where you are';
  const until = sharing.driving ? 'until the ride is over' : 'until you are in the car';
  return (
    <View style={[s.notice, off && s.noticeOff]}>
      <View style={[s.live, off && s.liveOff]} />
      <Text variant="small" tone="muted" style={s.flex}>
        {off
          ? 'Location sharing is paused for this ride.'
          : `${who} while Corridor is open, ${until}.`}
      </Text>
      <Pressable
        onPress={() => setPaused(trip.id, !off)}
        accessibilityRole="button"
        accessibilityLabel={off ? 'Share my location again' : 'Pause sharing my location'}
        hitSlop={8}>
        <Text variant="small" tone="brand" style={s.bold}>
          {off ? 'Share again' : 'Pause'}
        </Text>
      </Pressable>
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '700' },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: color.brandSoft,
      borderRadius: radius.md,
      padding: space.md,
    },
    carDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: color.brand,
      borderWidth: 2,
      borderColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    carInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: color.surface,
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: radius.md,
      padding: space.md,
    },
    noticeOff: { borderStyle: 'dashed' },
    live: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.go },
    liveOff: { backgroundColor: color.inkFaint },
  })
);
