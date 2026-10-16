import { useCallback, useEffect, useState } from 'react';

import { backend, type PayoutRow } from './backend';

/**
 * A driver's bank details for fuel contributions.
 *
 * Kept out of the store on purpose: they are not part of the corridor anyone
 * can browse. They are fetched only where they are shown, and the database
 * decides who gets an answer. A rider who is not on that driver's paid ride
 * tonight simply gets null.
 */
export type Payout = { bankName: string; accountNumber: string; accountName: string };

function toPayout(row: PayoutRow): Payout {
  return { bankName: row.bank_name, accountNumber: row.account_number, accountName: row.account_name };
}

export function usePayout(userId: string | undefined, enabled = true, refreshKey = '') {
  const [payout, setPayout] = useState<Payout | null>(null);
  const [fetching, setFetching] = useState(false);
  // Whose details the last answer was for. Until one arrives for the person
  // asked about, this is still loading, so switching a ride to paid does not
  // flash "add bank details" for the moment before the first fetch starts.
  const [answered, setAnswered] = useState<string | null>(null);
  // The last fetch failed, as opposed to there being nothing saved.
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!userId || !enabled) {
      setPayout(null);
      setAnswered(null);
      setFailed(false);
      return;
    }
    setFetching(true);
    try {
      const row = await backend.getPayout(userId);
      setPayout(row ? toPayout(row) : null);
      setFailed(false);
    } catch {
      // Not shown is the safe failure: the rider can still pay in cash.
      setPayout(null);
      setFailed(true);
    } finally {
      setAnswered(userId);
      setFetching(false);
    }
  }, [userId, enabled]);

  const loading = Boolean(userId && enabled) && (fetching || answered !== userId);

  useEffect(() => {
    reload();
    // refreshKey changes when a seat is taken, so details appear straight away.
  }, [reload, refreshKey]);

  /** Save your own, or pass null to remove them. Returns an error to show, or null. */
  const save = useCallback(
    async (next: Payout | null): Promise<string | null> => {
      if (!userId) return 'Sign in again to change this.';
      try {
        await backend.savePayout(
          userId,
          next && {
            bank_name: next.bankName.trim(),
            account_number: next.accountNumber.trim(),
            account_name: next.accountName.trim(),
          }
        );
        setPayout(next);
        setFailed(false);
        return null;
      } catch (e) {
        return e instanceof Error && e.message ? e.message : 'That did not save. Try again.';
      }
    },
    [userId]
  );

  return { payout, loading, failed, save, reload };
}
