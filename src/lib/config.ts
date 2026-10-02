/**
 * The verified email domain for the closed group.
 *
 * Read from the environment rather than written into the source, because the
 * repo must not carry the employer's name. Set EXPO_PUBLIC_WORK_DOMAIN in
 * .env (see .env.example). Metro inlines EXPO_PUBLIC_* at build time.
 */
export const WORK_DOMAIN = process.env.EXPO_PUBLIC_WORK_DOMAIN ?? 'example.com';

/** The window the evening actually spans, 16:00 to 23:00. Rides can leave anywhere in here. */
export const EVENING_START_MIN = 16 * 60;
export const EVENING_END_MIN = 23 * 60;
