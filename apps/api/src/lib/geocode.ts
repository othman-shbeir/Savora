export type Place = { label: string; lat: number; lng: number };
export type Geocoder = (query: string, lang: 'en' | 'ar') => Promise<Place[]>;

/**
 * Address search through OpenStreetMap's Nominatim. Its usage policy asks for at most one request
 * a second, an identifying user agent and no autocomplete, so searches run on Enter, one at a time,
 * and repeats come from a small cache. Production should switch to a paid geocoder or a self-hosted
 * Nominatim behind the same function.
 */
export function nominatim(contact = 'https://savora.menu'): Geocoder {
  const cache = new Map<string, Place[]>();
  let last = Promise.resolve();
  let lastAt = 0;
  return async (query, lang) => {
    const key = `${lang}|${query.trim().toLowerCase()}`;
    const hit = cache.get(key);
    if (hit) return hit;
    // Queue behind the previous request and keep a second between calls.
    const turn = last.then(async () => {
      const wait = lastAt + 1000 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastAt = Date.now();
    });
    last = turn.catch(() => {});
    await turn;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', 'accept-language': lang, addressdetails: '0' }).toString();
    const res = await fetch(url, { headers: { 'user-agent': `Savora/0.1 (${contact})` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    const rows = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    const places = rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(key, places);
    return places;
  };
}
