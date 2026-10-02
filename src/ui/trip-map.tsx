import { useMemo } from 'react';

import { useStore } from '@/data/store';
import type { Destination, DropOff, Trip } from '@/data/types';
import { useRoad } from '@/lib/directions';
import type { LngLat } from '@/lib/mapbox';
import { MapView, type MapMarker, type MapRoute, type Padding } from './map';

/** Somewhere in the middle of the corridor, for a map with nothing on it yet. */
const LAGOS: LngLat = { lat: 6.45, lng: 3.5 };

/**
 * A route along the corridor, drawn on the map.
 *
 * Screens pass landmark ids and nothing else: no coordinates, no provider
 * types. This is the thin map adapter the brief asks for. Swapping the tile
 * provider or the map underneath happens in ui/map.tsx and here, nowhere else.
 *
 * It never plots a person. The drop off pin is the place the rider chose to be
 * set down, shown only to them and to people on their trip.
 */
export function TripMap({
  stops,
  dropOff,
  destination,
  riderDrops,
  padding,
  showStops = true,
  controlsBottom,
}: {
  /** Landmark ids along the route, pickup first. */
  stops: string[];
  /** Where the viewer gets off, if they have said. */
  dropOff?: DropOff | null;
  /** Where the driver is really going, past the last stop. */
  destination?: Destination;
  /** The driver's view: each rider's drop off, numbered in the order they happen. */
  riderDrops?: RiderDrop[];
  padding?: Padding;
  /** Small markers for the stops in between. Off for a busy overview. */
  showStops?: boolean;
  /** Lifts the frame button clear of a bottom sheet. */
  controlsBottom?: number;
}) {
  const { landmark } = useStore();

  const located = useMemo(
    () =>
      stops
        .map(landmark)
        .filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number')
        // landmark() falls back to the first stop for an unknown id, which
        // would put a second pickup marker on the map. One of each.
        .filter((l, i, all) => all.findIndex((o) => o.id === l.id) === i),
    [stops, landmark]
  );

  const points = useMemo<LngLat[]>(
    () => [
      ...located.map((l) => ({ lat: l.lat as number, lng: l.lng as number })),
      ...(destination ? [{ lat: destination.lat, lng: destination.lng }] : []),
    ],
    [located, destination]
  );
  const road = useRoad(points);

  const drop =
    dropOff && typeof dropOff.lat === 'number' && typeof dropOff.lng === 'number'
      ? { lat: dropOff.lat, lng: dropOff.lng }
      : null;

  const markers = useMemo<MapMarker[]>(() => {
    // With a destination, the route ends there and every corridor stop after
    // the pickup is a stop on the way.
    const lastStop = destination ? -1 : located.length - 1;
    const out: MapMarker[] = located.map((l, i) => ({
      id: l.id,
      lat: l.lat as number,
      lng: l.lng as number,
      kind: i === 0 ? 'start' : i === lastStop ? 'end' : 'stop',
      label: i === 0 ? l.name : i === lastStop && located.length > 1 ? l.name : undefined,
    }));
    if (destination) {
      out.push({ id: 'destination', lat: destination.lat, lng: destination.lng, kind: 'end', label: destination.name });
    }
    for (const r of riderDrops ?? []) {
      if (r.lat === undefined || r.lng === undefined) continue;
      out.push({ id: `rider-${r.id}`, lat: r.lat, lng: r.lng, kind: 'rider', num: r.num });
    }
    const visible = showStops ? out : out.filter((m) => m.kind !== 'stop');
    if (drop && dropOff) {
      // The rider's own stop replaces the plain marker for it, rather than
      // stacking a second dot on top.
      const same = dropOff.landmarkId;
      return [
        ...visible.filter((m) => m.id !== same),
        { id: 'drop', lat: drop.lat, lng: drop.lng, kind: 'drop', label: dropOff.name },
      ];
    }
    return visible;
  }, [located, showStops, drop, dropOff, destination, riderDrops]);

  const routes = useMemo<MapRoute[]>(
    () => (road.length >= 2 ? [{ id: 'route', points: road, tone: 'primary' }] : []),
    [road]
  );

  const fit = useMemo<LngLat[]>(() => {
    const riders = (riderDrops ?? [])
      .filter((r) => r.lat !== undefined && r.lng !== undefined)
      .map((r) => ({ lat: r.lat as number, lng: r.lng as number }));
    const all = [...points, ...(drop ? [drop] : []), ...riders];
    return all.length > 0 ? all : [LAGOS];
  }, [points, drop, riderDrops]);

  return <MapView routes={routes} markers={markers} fit={fit} padding={padding} controlsBottom={controlsBottom} />;
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
