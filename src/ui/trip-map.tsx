import { useEffect, useMemo, useState } from 'react';

import { useStore } from '@/data/store';
import type { Destination, DropOff, Trip } from '@/data/types';
import { useRoad } from '@/lib/directions';
import { useMyLocation } from '@/lib/location';
import type { LngLat } from '@/lib/mapbox';
import { MapView, type MapMarker, type MapRoute, type Padding } from './map';

/**
 * Lagos, roughly from Ikeja down to the coast and out to Ajah, for a map with
 * nothing on it and no idea where the phone is. Two corners, so it frames the
 * city rather than zooming to street level on one point.
 */
const LAGOS: LngLat[] = [
  { lat: 6.62, lng: 3.3 },
  { lat: 6.42, lng: 3.6 },
];

/**
 * A ride drawn on the map: where it starts, the road, where it ends.
 *
 * With no ride to show, the map sits on this phone's own position, or on
 * Lagos when that is not known. It is never pinned to any one building.
 *
 * It never plots another person. The drop off pin is the place the rider chose
 * to be set down, shown only to them and to people on their trip. The one live
 * position is the viewer's own, as a "you are here" dot on their screen only.
 */
export function TripMap({
  origin,
  destination,
  dropOff,
  riderDrops,
  padding,
  controlsBottom,
}: {
  /** Where the ride starts. */
  origin?: Destination;
  /** Where the driver is going. */
  destination?: Destination;
  /** Where the viewer gets off, if they have said. */
  dropOff?: DropOff | null;
  /** The driver's view: each rider's drop off, numbered in the order they happen. */
  riderDrops?: RiderDrop[];
  padding?: Padding;
  /** Lifts the frame button clear of a bottom sheet. */
  controlsBottom?: number;
}) {
  const me = useMyLocation();

  // The first fix only. Framing on the live position would move the camera
  // every few metres while someone walks to the car.
  const [firstFix, setFirstFix] = useState<LngLat | null>(me);
  useEffect(() => {
    if (me && !firstFix) setFirstFix(me);
  }, [me, firstFix]);

  const points = useMemo<LngLat[]>(
    () =>
      [origin, destination]
        .filter((p): p is Destination => p !== undefined)
        .map((p) => ({ lat: p.lat, lng: p.lng })),
    [origin, destination]
  );
  const road = useRoad(points);

  const drop =
    dropOff && typeof dropOff.lat === 'number' && typeof dropOff.lng === 'number'
      ? { lat: dropOff.lat, lng: dropOff.lng }
      : null;

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (origin) out.push({ id: 'origin', lat: origin.lat, lng: origin.lng, kind: 'start', label: origin.name });
    if (destination) {
      out.push({ id: 'destination', lat: destination.lat, lng: destination.lng, kind: 'end', label: destination.name });
    }
    for (const r of riderDrops ?? []) {
      if (r.lat === undefined || r.lng === undefined) continue;
      out.push({ id: `rider-${r.id}`, lat: r.lat, lng: r.lng, kind: 'rider', num: r.num });
    }
    if (drop && dropOff) out.push({ id: 'drop', lat: drop.lat, lng: drop.lng, kind: 'drop', label: dropOff.name });
    return out;
  }, [origin, destination, riderDrops, drop, dropOff]);

  const routes = useMemo<MapRoute[]>(
    () => (road.length >= 2 ? [{ id: 'route', points: road, tone: 'primary' }] : []),
    [road]
  );

  const fit = useMemo<LngLat[]>(() => {
    const riders = (riderDrops ?? [])
      .filter((r) => r.lat !== undefined && r.lng !== undefined)
      .map((r) => ({ lat: r.lat as number, lng: r.lng as number }));
    // No ride on screen: frame where the phone is, with the drop off if set.
    const here = points.length === 0 && firstFix ? [firstFix] : [];
    const all = [...points, ...(drop ? [drop] : []), ...riders, ...here];
    return all.length > 0 ? all : LAGOS;
  }, [points, drop, riderDrops, firstFix]);

  return (
    <MapView
      routes={routes}
      markers={markers}
      fit={fit}
      padding={padding}
      controlsBottom={controlsBottom}
      me={me}
    />
  );
}

export type RiderDrop = {
  id: string;
  name: string;
  /** The place they named, or undefined if they never said. */
  place?: string;
  lat?: number;
  lng?: number;
  /** 1 for the first drop off on the road. */
  num: number;
};

/**
 * The riders' drop offs on a trip, in the order the driver's road reaches
 * them. Someone who never said where they get off is listed last, with no
 * marker. Only ever shown to the driver and the people on that ride.
 */
export function useRiderDrops(trip: Trip | undefined, riderIds: string[]): RiderDrop[] {
  const { person, alongRoute } = useStore();
  const key = riderIds.join(',');
  return useMemo(() => {
    if (!trip) return [];
    return riderIds
      .map((id) => {
        const p = person(id);
        const d = p.dropOff;
        const known = typeof d?.lat === 'number' && typeof d?.lng === 'number';
        return {
          id,
          name: p.name,
          place: d?.name,
          lat: known ? d?.lat : undefined,
          lng: known ? d?.lng : undefined,
          order: known ? alongRoute(trip, { lat: d!.lat as number, lng: d!.lng as number }) : Infinity,
        };
      })
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...r }, i) => ({ ...r, num: i + 1 }));
    // The ids stand in for the array, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, key, person, alongRoute]);
}
