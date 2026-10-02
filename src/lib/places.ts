import { searchPlaces as searchMapbox, type LngLat, type Place } from './mapbox';

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
