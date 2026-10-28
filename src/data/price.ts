import { useEffect, useState } from 'react';

import { CONTRIBUTION_NAIRA } from '@/lib/config';
import { backend } from './backend';

/**
 * The fuel contribution this car owner asks of each rider: the flat figure,
 * or a special one set for them in Watch Tower. The database posts a paid
 * ride at the special price whatever the phone sends, so a failed lookup
 * only means the form shows the flat figure for a moment.
 */
export function useOwnerPrice(userId: string | undefined): number {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    backend
      .getOwnerPrice(userId)
      .then((p) => alive && setPrice(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);

  return price ?? CONTRIBUTION_NAIRA;
}
