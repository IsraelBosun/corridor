/**
 * The App Store and Google Play rating prompt, after a finished ride.
 *
 * Asked after a person's 3rd finished ride, then every 10 rides. The store
 * decides whether it shows, and Apple shows it at most 3 times a year, so
 * nothing may depend on it. Never asked from a button, and never with a
 * question first: the stores do not allow sending only happy people to it.
 */
import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

const KEY = 'corridor.finished-rides';
const FIRST_ASK = 3;
const ASK_EVERY = 10;
/** Lets the ride complete screen settle first. */
const WAIT_MS = 1500;

type Finished = { count: number; recent: string[] };

/** Counts a finished ride once, however often its screen is opened. */
export async function rideFinished(tripId: string): Promise<void> {
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    const finished: Finished = saved ? JSON.parse(saved) : { count: 0, recent: [] };
    if (finished.recent.includes(tripId)) return;
    const count = finished.count + 1;
    const recent = [...finished.recent, tripId].slice(-10);
    await SecureStore.setItemAsync(KEY, JSON.stringify({ count, recent }));
    if (count < FIRST_ASK || (count - FIRST_ASK) % ASK_EVERY !== 0) return;
    if (!(await StoreReview.isAvailableAsync())) return;
    setTimeout(() => {
      StoreReview.requestReview().catch(() => {});
    }, WAIT_MS);
  } catch {
    // A rating prompt is never worth an error.
  }
}
