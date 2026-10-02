import type { Landmark } from './types';

/**
 * The corridor's stops used to live here, hardcoded, while an identical list
 * also sat in corridor.landmarks in the database. Two sources of truth with
 * nothing keeping them honest: renaming a stop meant a release.
 *
 * The database is the source of truth now. What is left here is a fallback, so
 * the first frame after launch has a stop name instead of a blank and a screen
 * rendered before the first load does not have to cope with an empty list. The
 * store replaces it the moment the real rows arrive.
 *
 * Adding, renaming or reordering a stop is a SQL update against
 * corridor.landmarks. Nothing in this file needs to be kept in step, which is
 * exactly why it says as little as possible.
 */
export const FALLBACK_LANDMARKS: Landmark[] = [
  { id: 'pickup', name: 'The pickup point', order: 0, typicalMin: 0 },
];

// The people who used to live here are gone too. Profiles come from the
// database and the store's person() resolves them. Nothing in this file knows
// about anybody or anywhere, which is the point.
