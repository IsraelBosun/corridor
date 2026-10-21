/**
 * The verified email domain for the closed group.
 *
 * Read from the environment rather than written into the source, because the
 * repo must not carry the employer's name. Set EXPO_PUBLIC_WORK_DOMAIN in
 * .env (see .env.example). Metro inlines EXPO_PUBLIC_* at build time.
 */
export const WORK_DOMAIN = process.env.EXPO_PUBLIC_WORK_DOMAIN ?? 'example.com';

/**
 * The fuel contribution a driver may ask of each rider, in naira. One flat
 * figure set by Corridor, never by the driver, so it stays a share of the fuel
 * rather than a fare. Riders pay the driver directly; the app never handles it.
 * The database only accepts this figure (trips_contribution_flat), so change
 * both together.
 */
export const CONTRIBUTION_NAIRA = 1000;

/** "₦1,000". */
export function naira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

/** The window the evening actually spans, 16:00 to 23:00. Rides can leave anywhere in here. */
export const EVENING_START_MIN = 16 * 60;
export const EVENING_END_MIN = 23 * 60;

/** The morning, 05:30 to 10:00. Rides to work leave in here, posted the same morning. */
export const MORNING_START_MIN = 5 * 60 + 30;
export const MORNING_END_MIN = 10 * 60;
