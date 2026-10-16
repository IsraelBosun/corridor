import type { Trip } from '@/data/types';
import { metresBetween, type LngLat } from './mapbox';

/**
 * How far a rider will walk to a pickup: about twelve minutes on foot.
 *
 * Worked out on the rider's own phone from where it is right now. The
 * position is never sent anywhere, and the driver never learns it.
 */
export const NEAR_PICKUP_M = 1000;

/** Metres from here to where the ride starts, or undefined when either is unknown. */
export function pickupMetres(trip: Trip, here: LngLat | null): number | undefined {
  if (!here || !trip.origin) return undefined;
  return metresBetween(here, trip.origin);
}

/** "350 m", "1.4 km". Rounded, because a GPS fix is not more exact than that. */
export function distanceText(m: number): string {
  if (m < 950) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
