/**
 * Phone numbers stay out of everything other people can read: the trip chat,
 * the note on a ride, the car description and the display name.
 *
 * A run of nine or more digits is refused. Nothing in this app needs one, and
 * the database applies the same pattern, so the rule holds even against a
 * client that skips this check.
 */
export const PHONE_SHAPED = /[0-9][0-9 ()+-]{8,}/;

export function hasPhone(text: string): boolean {
  return PHONE_SHAPED.test(text);
}

/** The sentence shown when one is refused, with where it was typed. */
export function noPhones(where: string): string {
  return `Phone numbers cannot go in ${where}. Everyone on the corridor can read it.`;
}
