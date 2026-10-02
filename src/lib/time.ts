import { EVENING_END_MIN, EVENING_START_MIN } from './config';

/** Minutes since midnight. Every time in the app is stored this way. */
export type Minutes = number;

export function hhmm(m: Minutes): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Where a time sits on the evening bar, as 0 to 1. */
export function eveningFraction(m: Minutes): number {
  const span = EVENING_END_MIN - EVENING_START_MIN;
  return Math.min(1, Math.max(0, (m - EVENING_START_MIN) / span));
}

/**
 * How long until departure, in the vaguest form that is still true.
 *
 * Deliberately coarse. A trip that leaves "in about 25 min" is a promise we
 * can keep; "19:10" is not, so nothing in the app counts down in minutes
 * except the last few, where the number is short enough to be honest.
 */
export function untilText(target: Minutes, now: Minutes): string {
  const d = target - now;
  // A few minutes late is still "now"; well past it, say when it was due
  // rather than claiming a car that should have gone is about to.
  if (d <= 0 && d > -20) return 'leaving now';
  if (d <= 0) return `was due at ${hhmm(target)}`;
  if (d < 5) return `in ${d} min`;
  if (d < 60) return `in about ${Math.round(d / 5) * 5} min`;
  const h = Math.floor(d / 60);
  const rem = d % 60;
  if (rem < 15) return `in about ${h} hr`;
  return `in about ${h} hr ${Math.round(rem / 15) * 15} min`;
}

/**
 * Journey length as a range, never a single arrival time.
 *
 * Evening traffic cannot be predicted to the minute, so the app refuses to
 * pretend. A rider sees "about 35 to 50 min" and can plan against the top of
 * it; a rider shown "19:10" learns within a week not to trust the app.
 */
export function rideLengthText(typicalMin: number): string {
  const low = Math.round((typicalMin * 0.85) / 5) * 5;
  const high = Math.round((typicalMin * 1.35) / 5) * 5;
  return `about ${low} to ${high} min`;
}

export function windowText(depart: Minutes, tolerance: number): string {
  return `${hhmm(depart)} give or take ${tolerance}`;
}

/** Clock time right now, as minutes since midnight. */
export function nowMinutes(): Minutes {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The clock the screens run on. The real one.
 *
 * It used to be pinned to 18:08 outside the evening window, so the app could
 * be demonstrated at any hour. With real rides that made a 21:00 ride tested
 * at night read "in about 2 hr 45 min" from a clock nobody was living in.
 */
export function demoNow(): Minutes {
  return nowMinutes();
}
