import { Linking } from 'react-native';

import type { LngLat } from './mapbox';

/**
 * Hand the drive to Google Maps, which drivers in Lagos use anyway for its
 * live traffic.
 *
 * It starts from wherever the phone is, stops at each drop off in order, and
 * ends where the driver is going. The link opens the Google Maps app when it
 * is installed and the website when it is not.
 *
 * The drop offs leave Corridor here, so this only ever runs on the driver's
 * tap, with the places that driver can already see on their own screen.
 */

/** Google Maps takes up to nine stops on the way. More than that are left off the end. */
const MAX_WAYPOINTS = 9;

function at(p: LngLat): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

export function directionsUrl(stops: LngLat[], destination?: LngLat): string | null {
  const end = destination ?? stops[stops.length - 1];
  if (!end) return null;
  const via = (destination ? stops : stops.slice(0, -1)).slice(0, MAX_WAYPOINTS);
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(at(end))}`;
  if (via.length > 0) url += `&waypoints=${encodeURIComponent(via.map(at).join('|'))}`;
  return url;
}

/** Opens the drive in Google Maps. False if there was nowhere to go or it would not open. */
export async function openDirections(stops: LngLat[], destination?: LngLat): Promise<boolean> {
  const url = directionsUrl(stops, destination);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
