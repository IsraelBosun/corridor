import { useSyncExternalStore } from 'react';

import { EVENING_END_MIN, EVENING_START_MIN } from './config';

/** Minutes since midnight. Every time in the app is stored this way. */
export type Minutes = number;

/** The 24 hour form the database stores: "07:30". Never shown on screen; see clock. */
export function hhmm(m: Minutes): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** A time as people say it, and as every screen shows it: "7:30 AM", "9:00 PM". */
export function clock(m: Minutes): string {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
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
 * can keep; "7:10 PM" is not, so nothing in the app counts down in minutes
 * except the last few, where the number is short enough to be honest.
 */
export function untilText(target: Minutes, now: Minutes): string {
  const d = target - now;
  // A few minutes late is still "now"; well past it, say when it was due
  // rather than claiming a car that should have gone is about to.
  if (d <= 0 && d > -20) return 'leaving now';
  if (d <= 0) return `was due at ${clock(target)}`;
  if (d < 5) return `in ${d} min`;
  if (d < 60) return `in about ${Math.round(d / 5) * 5} min`;
  const { h, q } = hoursAndQuarters(d);
  if (q === 0) return `in about ${h} hr`;
  return `in about ${h} hr ${q} min`;
}

/** Whole hours and the remainder to the nearest quarter, carrying 60 into the hour. */
function hoursAndQuarters(d: Minutes): { h: number; q: number } {
  let h = Math.floor(d / 60);
  let q = d % 60 < 15 ? 0 : Math.round((d % 60) / 15) * 15;
  if (q === 60) {
    h += 1;
    q = 0;
  }
  return { h, q };
}

/** untilText for the start of a line or a heading: "In about 2 hr", "Leaving now". */
export function untilHeading(target: Minutes, now: Minutes): string {
  const t = untilText(target, now);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The same, short enough for a small tile under the label "In": "25 min",
 * "2h 15m", "Now", "Overdue". Always with a unit.
 */
export function untilShort(target: Minutes, now: Minutes): string {
  const d = target - now;
  if (d <= 0 && d > -20) return 'Now';
  if (d <= 0) return 'Overdue';
  if (d < 5) return `${d} min`;
  if (d < 60) return `${Math.round(d / 5) * 5} min`;
  const { h, q } = hoursAndQuarters(d);
  return q === 0 ? `${h} hr` : `${h}h ${q}m`;
}

/**
 * Journey length as a range, never a single arrival time.
 *
 * Evening traffic cannot be predicted to the minute, so the app refuses to
 * pretend. A rider sees "about 35 to 50 min" and can plan against the top of
 * it; a rider shown "7:10 PM" learns within a week not to trust the app.
 */
export function rideLengthText(typicalMin: number): string {
  const low = Math.round((typicalMin * 0.85) / 5) * 5;
  const high = Math.round((typicalMin * 1.35) / 5) * 5;
  return `about ${low} to ${high} min`;
}

export function windowText(depart: Minutes, tolerance: number): string {
  return `${clock(depart)} give or take ${tolerance}`;
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

/*
  One timer for every screen that shows a countdown. Without it "in 5 min"
  only moved when something else redrew the screen, so a phone left open on
  the pickup read "in 5 min" long after the ride was due.
*/
const ticks = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function onTick(l: () => void) {
  ticks.add(l);
  if (!timer) timer = setInterval(() => ticks.forEach((t) => t()), 15_000);
  return () => {
    ticks.delete(l);
    if (ticks.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** demoNow, redrawing the caller each time the minute changes. */
export function useNow(): Minutes {
  return useSyncExternalStore(onTick, demoNow);
}
