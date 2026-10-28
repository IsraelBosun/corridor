/**
 * Checks a personal email before anything is sent to it, so a slip like
 * "gmail.comg" is caught on the phone instead of bouncing. Asked for by the
 * owner on 2026-10-28.
 *
 * Only checked when the button is tapped, never while typing. The screen
 * shows the answer in red under the email box.
 *
 * Personal email only. A work email can be any company's domain, so there is
 * no list to compare it with; its code going astray is the check there.
 */

/** The same shape the work email edge function accepts. */
const SHAPE = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)+[a-z]{2,}$/;

/** Providers people mistype often enough to suggest. */
const SUGGEST = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];

/**
 * Real domains close enough to one above to look like a typo. Never
 * "corrected".
 */
const REAL = new Set([
  ...SUGGEST,
  'mail.com',
  'gmx.com',
  'ymail.com',
  'live.com',
  'msn.com',
  'me.com',
  'mac.com',
  'aol.com',
  'yahoo.co.uk',
  'outlook.co.uk',
  'hotmail.co.uk',
]);

/** Real endings one letter away from "com". Anything else that close is a slip. */
const NEAR_COM = new Set(['co', 'cm', 'om', 'cam']);

/** Trimmed and lower case, the way it is sent and stored. */
export function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** What is wrong with this email, for the red line under the box, or null when it looks right. */
export function emailProblem(email: string): string | null {
  const e = cleanEmail(email);
  if (!SHAPE.test(e) || e.length > 254) {
    return 'That email address does not look complete. Check it and try again.';
  }

  const [name, domain] = e.split('@');
  if (REAL.has(domain)) return null;

  const close = SUGGEST.find((d) => distance(domain, d) <= 2);
  if (close) return `Check your email address. Did you mean ${name}@${close}?`;

  const dot = domain.lastIndexOf('.');
  const end = domain.slice(dot + 1);
  if (end !== 'com' && !NEAR_COM.has(end) && distance(end, 'com') === 1) {
    return `Check the end of your email address. Did you mean ${name}@${domain.slice(0, dot)}.com?`;
  }

  return null;
}

/**
 * Letters to add, remove or change to turn one word into the other, with two
 * neighbours swapped ("cmo") counted as one slip.
 */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
