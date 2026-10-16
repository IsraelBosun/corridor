import { MAPBOX_TOKEN, searchPlaces as searchMapbox, type LngLat, type Place } from './mapbox';

/**
 * Place search for "where are you getting off".
 *
 * Mapbox alone knows Lagos streets but almost none of the places people
 * actually name: VGC, Novare Mall, Ikota Shopping Complex, the estates. Those
 * live in OpenStreetMap, so Photon (an OSM search with no key) is asked first
 * and Mapbox fills in streets it missed. Either can fail on its own and the
 * other still answers.
 *
 * Only the typed text and a fixed point on the corridor are sent. Nothing about
 * the person is part of the request, and nothing is kept from the answer except
 * the one place they pick.
 */

export type { Place } from './mapbox';

/** Greater Lagos, west to east and south to north. Results outside it are noise. */
const LAGOS_BBOX = { west: 2.7, south: 6.36, east: 4.35, north: 6.75 };

const LIMIT = 8;

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
  };
};

async function searchPhoton(query: string, near: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const b = LAGOS_BBOX;
  const url =
    'https://photon.komoot.io/api/' +
    `?q=${encodeURIComponent(query)}` +
    `&lat=${near.lat}&lon=${near.lng}` +
    `&bbox=${b.west},${b.south},${b.east},${b.north}` +
    '&lang=en' +
    `&limit=${LIMIT}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status}).`);
  const body = (await res.json()) as { features?: PhotonFeature[] };

  return (body.features ?? [])
    .map((f, i): Place | null => {
      const p = f.properties ?? {};
      const c = f.geometry?.coordinates;
      if (!p.name || !c) return null;
      const area = [p.street, p.district ?? p.locality, p.city ?? p.county]
        .filter((part): part is string => Boolean(part) && part !== p.name)
        // "Ikota, Ikota" says nothing twice.
        .filter((part, j, all) => all.indexOf(part) === j);
      return {
        id: `osm-${p.osm_type ?? ''}${p.osm_id ?? i}`,
        name: p.name,
        context: area.join(', '),
        lat: c[1],
        lng: c[0],
        isStop: false,
      };
    })
    .filter((p): p is Place => p !== null);
}

/** Same name within about 300 m is the same place, whichever source said it. */
function sameAs(a: Place, b: Place): boolean {
  return (
    a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
    Math.abs(a.lat - b.lat) < 0.003 &&
    Math.abs(a.lng - b.lng) < 0.003
  );
}

export async function searchPlaces(query: string, near: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [osm, mapbox] = await Promise.allSettled([
    searchPhoton(q, near, signal),
    searchMapbox(q, near, signal),
  ]);
  if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  if (osm.status === 'rejected' && mapbox.status === 'rejected') throw osm.reason;

  const out: Place[] = [];
  for (const p of [
    ...(osm.status === 'fulfilled' ? osm.value : []),
    ...(mapbox.status === 'fulfilled' ? mapbox.value : []),
  ]) {
    if (!out.some((o) => sameAs(o, p))) out.push(p);
  }
  return out.slice(0, LIMIT);
}

/**
 * A name for where the phone is right now, for "use my current location".
 *
 * OpenStreetMap first, because it names the places people say out loud (an
 * estate, a mall, a club); Mapbox for the street when that has nothing. Never
 * a house number: a driver offering a ride from home must not publish their
 * address to everyone browsing. If neither answers, the point is still used,
 * under a plain name the driver can see before posting.
 */
export async function nameForPoint(point: LngLat, signal?: AbortSignal): Promise<Place> {
  const fallback: Place = {
    id: 'here',
    name: 'My location',
    context: '',
    lat: point.lat,
    lng: point.lng,
    isStop: false,
  };

  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}&lang=en&limit=1`,
      { signal }
    );
    if (res.ok) {
      const body = (await res.json()) as { features?: PhotonFeature[] };
      const p = body.features?.[0]?.properties;
      const name = p?.name ?? p?.street;
      if (name) {
        const area = [p?.district ?? p?.locality, p?.city ?? p?.county].filter(
          (part): part is string => Boolean(part) && part !== name
        );
        return { ...fallback, name: `Near ${name}`, context: area.join(', ') };
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }

  try {
    const url =
      'https://api.mapbox.com/search/geocode/v6/reverse' +
      `?longitude=${point.lng}&latitude=${point.lat}` +
      '&types=street,neighborhood,locality&limit=1' +
      `&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url, { signal });
    if (res.ok) {
      const body = (await res.json()) as {
        features?: { properties?: { name?: string; place_formatted?: string } }[];
      };
      const f = body.features?.[0]?.properties;
      if (f?.name) return { ...fallback, name: `Near ${f.name}`, context: f.place_formatted ?? '' };
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }

  return fallback;
}
