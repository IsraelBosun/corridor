/**
 * Where this driver last started a ride, to fill in the next one.
 *
 * Kept on this phone only, one value, overwritten on every post. It is never
 * sent anywhere: the backend only ever sees tonight's trip, which keeps rule 2
 * (no history of where anybody has been).
 */
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

import type { Destination } from '@/data/types';

const KEY = 'corridor.last-origin';

let cached: Destination | null | undefined;

function parse(raw: string | null): Destination | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Destination;
    return typeof v?.name === 'string' && typeof v.lat === 'number' && typeof v.lng === 'number' ? v : null;
  } catch {
    return null;
  }
}

export async function loadLastOrigin(): Promise<Destination | null> {
  if (cached !== undefined) return cached;
  cached = parse(await SecureStore.getItemAsync(KEY).catch(() => null));
  return cached;
}

export function saveLastOrigin(place: Destination): void {
  cached = place;
  SecureStore.setItemAsync(KEY, JSON.stringify(place)).catch(() => {
    // Not remembered: the driver types it again next time.
  });
}

/** The last start, once it has been read. Null when there is none. */
export function useLastOrigin(): Destination | null {
  const [value, setValue] = useState<Destination | null>(cached ?? null);
  useEffect(() => {
    let alive = true;
    loadLastOrigin().then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}
