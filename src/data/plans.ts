import { useCallback, useEffect, useState } from 'react';

import { backend, type PlanRow } from './backend';
import type { Direction } from './types';

/**
 * A driver's regular rides, for Account. Only the driver reads their own;
 * the rides they post are ordinary rides in the store like any other.
 */
export type Plan = {
  id: string;
  direction: Direction;
  weekdays: number[];
  /** "07:30". */
  time: string;
  from: string;
  to: string;
  active: boolean;
};

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    direction: row.direction,
    weekdays: row.weekdays,
    time: row.depart_time.slice(0, 5),
    from: row.origin_name,
    to: row.destination_name ?? 'their destination',
    active: row.active,
  };
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
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      await backend.deletePlan(id).catch(() => reload());
    },
    [reload]
  );

  return { plans, loading, failed, setActive, remove, reload };
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** ISO weekdays as words: "weekday", "day", "Monday, Wednesday and Friday". */
export function daysText(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === '1,2,3,4,5') return 'weekday';
  if (sorted.length === 7) return 'day';
  const names = sorted.map((n) => DAY_NAMES[n - 1] ?? '');
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
