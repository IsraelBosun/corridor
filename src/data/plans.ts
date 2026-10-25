import { useCallback, useEffect, useState } from 'react';

import { syncReminders } from '@/lib/reminders';
import { clock, type Minutes } from '@/lib/time';

import { backend, type PlanFields, type PlanRow } from './backend';
import type { Destination, Direction } from './types';

/**
 * A driver's regular rides, for Account and the post screen. Only the driver
 * reads their own; the rides they post are ordinary rides in the store like
 * any other. A driver has at most one each way; the database insists.
 */
export type Plan = {
  id: string;
  direction: Direction;
  weekdays: number[];
  departMin: Minutes;
  /** "7:30 AM". */
  time: string;
  toleranceMin: number;
  seatsTotal: number;
  origin: Destination;
  destination?: Destination;
  from: string;
  to: string;
  active: boolean;
};

/** What the regular ride screen can change. */
export type PlanChanges = Partial<
  Pick<
    PlanFields,
    | 'weekdays'
    | 'depart_time'
    | 'tolerance_min'
    | 'seats_total'
    | 'origin_name'
    | 'origin_lat'
    | 'origin_lng'
    | 'destination_name'
    | 'destination_lat'
    | 'destination_lng'
  >
>;

function toPlan(row: PlanRow): Plan {
  const [h, m] = row.depart_time.split(':').map(Number);
  const departMin = h * 60 + m;
  const destination =
    row.destination_name && typeof row.destination_lat === 'number' && typeof row.destination_lng === 'number'
      ? { name: row.destination_name, lat: row.destination_lat, lng: row.destination_lng }
      : undefined;
  return {
    id: row.id,
    direction: row.direction,
    weekdays: row.weekdays,
    departMin,
    time: clock(departMin),
    toleranceMin: row.tolerance_min,
    seatsTotal: row.seats_total,
    origin: { name: row.origin_name, lat: row.origin_lat, lng: row.origin_lng },
    destination,
    from: row.origin_name,
    to: row.destination_name ?? 'their destination',
    active: row.active,
  };
}

/** The phone's nudges skip the days a regular ride is posted, so they follow every change. */
function resyncReminders() {
  syncReminders('driver', false).catch(() => {});
}

export function usePlans(userId: string | undefined) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setPlans((await backend.listPlans()).map(toPlan));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, active } : p)));
      await backend.setPlanActive(id, active).catch(() => reload());
      resyncReminders();
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      await backend.deletePlan(id).catch(() => reload());
      resyncReminders();
    },
    [reload]
  );

  /** Save changes to a plan. Throws if they did not save, so the screen can say so. */
  const update = useCallback(
    async (id: string, changes: PlanChanges) => {
      await backend.updatePlan(id, changes);
      await reload();
      resyncReminders();
    },
    [reload]
  );

  return { plans, loading, failed, setActive, remove, update, reload };
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * ISO weekdays as words, after "every": "weekday", "day", "Monday to
 * Thursday", "Monday, Wednesday and Friday". Three or more days in a row
 * read as a range.
 */
export function daysText(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.join() === '1,2,3,4,5') return 'weekday';
  if (sorted.length === 7) return 'day';
  const name = (n: number) => DAY_NAMES[n - 1] ?? '';
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${name(sorted[i])} to ${name(sorted[j])}`);
    else for (let k = i; k <= j; k++) parts.push(name(sorted[k]));
    i = j + 1;
  }
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
