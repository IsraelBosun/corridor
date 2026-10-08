import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { knownRoad, roadFor } from '@/lib/directions';
import { placeOnRoute, type LngLat } from '@/lib/mapbox';
import * as SecureStore from 'expo-secure-store';

import { demoNow, type Minutes } from '@/lib/time';
import { backend, type TripFields, type TripRow } from './backend';
import { toPerson, useSession } from './session';
import type { Destination, DropOff, Person, Role, Trip } from './types';

/**
 * Everything the screens read and write.
 *
 * The rows come from whichever backend is running (the hosted database, or
 * the local test one), and the truth arrives over a change subscription rather
 * than from a setState call.
 */

/**
 * The database stores timestamps, the UI reasons in minutes since midnight.
 * Minutes are right for the screens (a departure window is a shape on a bar,
 * not a date) and wrong for storage, so the conversion lives here at the edge.
 */
function toMinutes(iso: string): Minutes {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Minutes are assumed to mean today. Evening direction only, so they do. */
function toTimestamp(min: Minutes): string {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d.toISOString();
}

function toTrip(row: TripRow): Trip {
  const presentAt: Record<string, Minutes> = {};
  for (const r of row.reservations) {
    if (r.present_at) presentAt[r.rider_id] = toMinutes(r.present_at);
  }
  return {
    id: row.id,
    code: row.code,
    driverId: row.driver_id,
    departMin: toMinutes(row.depart_at),
    toleranceMin: row.tolerance_min,
    seatsTotal: row.seats_total,
    riders: row.reservations.map((r) => r.rider_id),
    presentAt,
    vehicle: row.vehicle ?? '',
    note: row.note ?? '',
    status: row.status,
    announceOnDepart: row.announce_on_depart,
    cancelledAtMin: row.cancelled_at ? toMinutes(row.cancelled_at) : undefined,
    origin: place(row.origin_name, row.origin_lat, row.origin_lng),
    destination: place(row.destination_name, row.destination_lat, row.destination_lng),
  };
}

function place(name: string | null, lat: number | null, lng: number | null): Destination | undefined {
  return name && typeof lat === 'number' && typeof lng === 'number' ? { name, lat, lng } : undefined;
}

function toFields(t: TripDraft): TripFields {
  return {
    depart_at: toTimestamp(t.departMin),
    tolerance_min: t.toleranceMin,
    seats_total: t.seatsTotal,
    vehicle: t.vehicle || null,
    note: t.note || null,
    announce_on_depart: t.announceOnDepart,
    destination_name: t.destination?.name ?? null,
    destination_lat: t.destination?.lat ?? null,
    destination_lng: t.destination?.lng ?? null,
    origin_name: t.origin?.name ?? null,
    origin_lat: t.origin?.lat ?? null,
    origin_lng: t.origin?.lng ?? null,
  };
}

type Store = {
  trips: Trip[];
  /** True only on the very first load, so the map does not flash empty. */
  loading: boolean;
  /** Set when the last request failed. The screens surface it rather than lie. */
  error: string | null;
  clearError: () => void;

  me: Person | null;
  /** Whoever is signed in drives or rides. It decides the whole home screen. */
  role: Role;
  /** Everyone on the corridor, by id. */
  people: Record<string, Person>;
  person: (id: string) => Person;

  /** Where the rider gets off, anywhere they searched. */
  dropOff: DropOff | null;
  /** The name to put in a sentence, with a neutral stand in before it is set. */
  dropOffName: string;
  /**
   * Does this trip go past where you get off. Measured against the road the
   * driver will actually drive, from where they start to their destination. Without
   * coordinates on both sides there is no honest answer, so it says no.
   */
  serves: (trip: Trip) => boolean;
  /**
   * Metres driven from the start before the car is nearest this place. Puts
   * the drop offs in the order they happen.
   */
  alongRoute: (trip: Trip, place: LngLat) => number;

  /** Tonight's live ride you are driving, if any. */
  myTrip: Trip | undefined;
  /**
   * The ride you hold a seat on tonight, if any. Cancelled ones included, so
   * the rider is told, and ones already on the road, until the rider says they
   * have been dropped off.
   */
  mySeat: Trip | undefined;
  /** A ride that has set off and is not yet over for you, as driver or rider. */
  underway: (trip: Trip) => boolean;
  /** "I have been dropped off", or the driver's "Done": the ride is over for you. */
  finishRide: (tripId: string) => void;

  setDropOff: (place: DropOff | null) => Promise<void>;
  refresh: () => Promise<void>;

  /** Returns false when the last seat went while the rider was deciding. */
  reserve: (tripId: string) => Promise<boolean>;
  releaseSeat: (tripId: string) => Promise<void>;
  cancelTrip: (tripId: string) => Promise<void>;
  markPresent: (tripId: string, personId: string) => Promise<void>;
  markAbsent: (tripId: string, personId: string) => Promise<void>;
  depart: (tripId: string) => Promise<void>;
  postTrip: (t: TripDraft) => Promise<string | null>;
  /**
   * Change tonight's post. A driver gets one live trip, so a second thought
   * about the time is an edit. Reserved seats survive it.
   */
  editTrip: (tripId: string, t: TripDraft) => Promise<boolean>;
};

export type TripDraft = Omit<Trip, 'id' | 'code' | 'driverId' | 'riders' | 'presentAt' | 'status'>;

const Ctx = createContext<Store | null>(null);

/** Somebody who has left, or a row we have not loaded yet. Never a crash. */
const UNKNOWN: Person = {
  id: 'unknown',
  initials: '??',
  name: 'Someone',
  team: '',
  floor: '',
};

const FINISHED_KEY = 'corridor.finished-rides';
/** The longest an evening ride can still be "on the way" without anyone saying it is over. */
const RIDE_MAX_MIN = 180;

/**
 * How far off the driver's road still counts as on the way: a short walk, or a
 * small detour the driver can agree to in the ride chat. Searched estates come
 * back as their middle, not their gate, so a big one like Lekki Phase 1 sits
 * about a kilometre off the expressway it borders. 1.5 km keeps those in.
 */
const NEAR_ROAD_M = 1500;
/** Before the road has loaded, the route is straight lines, so allow more. */
const NEAR_LINE_M = 2000;

function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { session, me, member, tester, setDropOff: saveDropOff } = useSession();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The profile is the only copy of where you get off.
  const dropOff = me?.dropOff ?? null;
  const dropOffName = dropOff?.name ?? 'your stop';
  const role: Role = me?.role ?? 'passenger';

  const refresh = useCallback(async () => {
    // Until the work email is verified every policy answers with nothing, so
    // reading then would leave an empty corridor that never fills in. Keyed on
    // member below, so verifying runs this again.
    if (!session || !member) {
      setTrips([]);
      setPeople({});
      setLoading(false);
      return;
    }
    try {
      const [tripRows, profileRows] = await Promise.all([backend.listTrips(), backend.listProfiles()]);
      setError(null);
      setTrips(tripRows.map(toTrip));
      const map: Record<string, Person> = {};
      for (const row of profileRows) map[row.id] = toPerson(row);
      setPeople(map);
    } catch (e) {
      setError(messageOf(e, 'Could not reach the corridor.'));
    } finally {
      setLoading(false);
    }
  }, [session, member]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * A seat going while you are looking at it is the thing this most has to get
   * right. Any change to a trip or a reservation refetches the lot. Patching
   * rows would be faster and would also be the kind of cleverness that puts a
   * stale seat count in front of somebody.
   */
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!session) return;
    const unsubscribe = backend.onTripsChange(() => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(refresh, 150);
    });
    return () => {
      if (pending.current) clearTimeout(pending.current);
      unsubscribe();
    };
  }, [session, refresh]);

  const clearError = useCallback(() => setError(null), []);

  const person = useCallback(
    (id: string): Person => people[id] ?? (me && me.id === id ? me : UNKNOWN),
    [people, me]
  );

  const setDropOff = useCallback(
    async (place: DropOff | null) => {
      const result = await saveDropOff(place);
      if (!result.ok) setError(result.error);
    },
    [saveDropOff]
  );

  // Every trip's points: where it starts, then where it is going.
  const pointsOf = useCallback((trip: Trip): LngLat[] => tripPoints(trip), []);

  // The road each trip drives, fetched once per route and shared with the map.
  // Matching is redone as each one lands.
  const [roads, setRoads] = useState<Record<string, LngLat[]>>({});
  useEffect(() => {
    let alive = true;
    for (const trip of trips) {
      const points = pointsOf(trip);
      if (points.length < 2 || knownRoad(points)) continue;
      roadFor(points)
        .then((line) => {
          if (alive) setRoads((prev) => ({ ...prev, [trip.id]: line }));
        })
        .catch(() => {
          // Straight lines stand in until a later refresh gets the road.
        });
    }
    return () => {
      alive = false;
    };
  }, [trips, pointsOf]);

  /** The road if we have it, otherwise straight lines between the points. */
  const routeOf = useCallback(
    (trip: Trip): { line: LngLat[]; road: boolean } => {
      const points = pointsOf(trip);
      const road = knownRoad(points) ?? roads[trip.id];
      return road ? { line: road, road: true } : { line: points, road: false };
    },
    [pointsOf, roads]
  );

  const serves = useCallback(
    (trip: Trip) => {
      if (!dropOff) return false;
      const { lat, lng } = dropOff;
      if (typeof lat !== 'number' || typeof lng !== 'number') return false;

      const { line, road } = routeOf(trip);
      if (line.length < 2) return false;
      return placeOnRoute({ lat, lng }, line).off <= (road ? NEAR_ROAD_M : NEAR_LINE_M);
    },
    [dropOff, routeOf]
  );

  const alongRoute = useCallback(
    (trip: Trip, place: LngLat) => placeOnRoute(place, routeOf(trip).line).along,
    [routeOf]
  );

  // Rides that are over for this person. A trip has no "arrived" state: the
  // car is on the road until each person says they are done, so that is kept
  // on this phone, by trip id, and goes when the trip is purged.
  const [finished, setFinished] = useState<Set<string>>(new Set());
  useEffect(() => {
    SecureStore.getItemAsync(FINISHED_KEY)
      .then((v) => v && setFinished(new Set(JSON.parse(v) as string[])))
      .catch(() => {
        // Nothing stored: every ride on the road still counts as on the road.
      });
  }, []);
  const finishRide = useCallback(
    (tripId: string) => {
      setFinished((prev) => {
        // Only tonight's trips are worth remembering.
        const live = new Set(trips.map((t) => t.id));
        const next = new Set([...prev].filter((id) => live.has(id)));
        next.add(tripId);
        SecureStore.setItemAsync(FINISHED_KEY, JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    [trips]
  );

  const underway = useCallback(
    (t: Trip) =>
      t.status === 'left' &&
      !finished.has(t.id) &&
      // A ride nobody marked done still ends: nothing on this corridor takes
      // three hours, and an evening ride must not still be "on the way" at 1am.
      // Minutes since departure, wrapping past midnight.
      (demoNow() - t.departMin + 1440) % 1440 < RIDE_MAX_MIN,
    [finished]
  );

  const myTrip = useMemo(
    () => trips.find((t) => t.driverId === me?.id && (t.status === 'posted' || t.status === 'boarding')),
    [trips, me]
  );
  const mySeat = useMemo(
    () =>
      trips.find(
        (t) =>
          me &&
          // Testers may hold a seat in their own ride; nobody else can.
          (tester || t.driverId !== me.id) &&
          t.riders.includes(me.id) &&
          // Once the car has left, the rider still has a ride until it is over.
          (t.status !== 'left' || underway(t))
      ),
    [trips, me, underway, tester]
  );

  /** Run a write, surface its failure, and refetch either way. */
  const run = useCallback(
    async <T,>(work: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await work();
      } catch (e) {
        setError(messageOf(e, 'That did not work. Try again.'));
        return fallback;
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  const reserve = useCallback((tripId: string) => run(() => backend.reserveSeat(tripId), false), [run]);

  const releaseSeat = useCallback(
    async (tripId: string) => {
      if (!me) return;
      await run(() => backend.releaseSeat(tripId, me.id), undefined);
    },
    [me, run]
  );

  const cancelTrip = useCallback((tripId: string) => run(() => backend.cancelTrip(tripId), undefined), [run]);

  // Not a status write. Departing also releases the seats of anyone who never
  // showed, so the trip that sets off carries the people who are in it.
  const depart = useCallback((tripId: string) => run(() => backend.departTrip(tripId), undefined), [run]);

  const markPresent = useCallback(
    (tripId: string, personId: string) =>
      run(() => backend.setPresence(tripId, personId, new Date().toISOString()), undefined),
    [run]
  );

  const markAbsent = useCallback(
    (tripId: string, personId: string) => run(() => backend.setPresence(tripId, personId, null), undefined),
    [run]
  );

  const postTrip: Store['postTrip'] = useCallback(
    async (draft) => {
      if (!me) return null;
      return run<string | null>(() => backend.createTrip(me.id, toFields(draft)), null);
    },
    [me, run]
  );

  const editTrip: Store['editTrip'] = useCallback(
    (tripId, draft) =>
      run(async () => {
        await backend.editTrip(tripId, toFields(draft));
        return true;
      }, false),
    [run]
  );

  const value = useMemo<Store>(
    () => ({
      trips,
      loading,
      error,
      clearError,
      me,
      role,
      people,
      person,
      dropOff,
      dropOffName,
      serves,
      alongRoute,
      myTrip,
      mySeat,
      underway,
      finishRide,
      setDropOff,
      refresh,
      reserve,
      releaseSeat,
      cancelTrip,
      markPresent,
      markAbsent,
      depart,
      postTrip,
      editTrip,
    }),
    [
      trips, loading, error, clearError, me, role, people, person,
      dropOff, dropOffName, serves, alongRoute, myTrip, mySeat, underway, finishRide, setDropOff, refresh, reserve, releaseSeat,
      cancelTrip, markPresent, markAbsent, depart, postTrip, editTrip,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

export function useTrip(id: string | undefined): Trip | undefined {
  const { trips } = useStore();
  return trips.find((t) => t.id === id);
}

/** A trip's start, then its end, where each is known. */
export function tripPoints(trip: Trip): LngLat[] {
  return [trip.origin, trip.destination]
    .filter((p): p is Destination => p !== undefined)
    .map((p) => ({ lat: p.lat, lng: p.lng }));
}

/** Where riders meet the car, for a sentence. */
export function startName(trip: Trip): string {
  return trip.origin?.name ?? 'the pickup point';
}

/** Where the driver is going, for a sentence. */
export function endName(trip: Trip): string {
  return trip.destination?.name ?? 'their destination';
}

/** Seats still open on a trip. */
export function seatsOpen(t: Trip): number {
  return Math.max(0, t.seatsTotal - t.riders.length);
}

export type { Minutes };
