'use client';

import 'leaflet/dist/leaflet.css';
import type { Circle, Map as LeafletMap, Marker } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { distanceKm, type Locale } from '@savora/shared';
import { cx } from '@/lib/cx';

// OpenStreetMap tiles: free with attribution and light use. Production should point this at a
// tile provider (MapTiler, Stadia…) through NEXT_PUBLIC_MAP_TILES.
const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** Al-Manara Square, Ramallah: where the map opens before a pin is dropped. */
const FALLBACK = { lat: 31.9038, lng: 35.2034 };

export type Pin = { lat: number; lng: number };
type Other = { id: string; name: string; lat: number; lng: number };

const pinHtml = (initial: string) =>
  `<svg width="40" height="50" viewBox="0 0 40 50" style="display:block;filter:drop-shadow(0 6px 10px rgba(219,26,26,.35))"><path d="M20 49C20 49 38 30 38 18.5C38 8.3 29.9 1 20 1S2 8.3 2 18.5C2 30 20 49 20 49Z" fill="#db1a1a" stroke="#fff" stroke-width="2"/><text x="20" y="24.5" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="15" font-weight="800">${initial.replace(/[<&>"]/g, '')}</text></svg>`;
const otherHtml = (label: string) => `<span class="savora-map-other"><span class="dot"></span><span class="label">${label.replace(/[<&>"]/g, '')}</span></span>`;

/** Editable map: drag the pin or click to move it, an optional delivery ring, the organization's
 *  other branches, an address search, and zoom controls that match the app. */
export function LocationMap({
  pin,
  onPin,
  radiusM,
  others,
  initial,
  label,
  locale,
  editable = true,
  t,
  search,
}: {
  pin: Pin | null;
  onPin?: (p: Pin) => void;
  radiusM: number | null;
  others: Other[];
  initial: string;
  label: string;
  locale: Locale;
  editable?: boolean;
  t: {
    zoomIn: string;
    zoomOut: string;
    recenter: string;
    pinHint: string;
    noPin: string;
    search: string;
    searching: string;
    noResults: string;
    geocoderDown: string;
  };
  search?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const circle = useRef<Circle | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const onPinRef = useRef(onPin);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{
    label: string;
    lat: number;
    lng: number;
  }> | null>(null);
  const [searchState, setSearchState] = useState<'idle' | 'busy' | 'empty' | 'down'>('idle');

  useEffect(() => {
    onPinRef.current = onPin;
  }, [onPin]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((leaflet) => {
      if (cancelled || !box.current || map.current) return;
      L.current = leaflet;
      const start = pin ?? FALLBACK;
      const still = editable
        ? {}
        : {
            dragging: false,
            touchZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
          };
      const m = leaflet
        .map(box.current, {
          zoomControl: false,
          attributionControl: true,
          scrollWheelZoom: false,
          ...still,
        })
        .setView([start.lat, start.lng], pin ? 16 : 13);
      leaflet.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
      m.attributionControl.setPrefix(false);
      if (editable)
        m.on('click', (e) =>
          onPinRef.current?.({
            lat: Number(e.latlng.lat.toFixed(6)),
            lng: Number(e.latlng.lng.toFixed(6)),
          }),
        );
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      circle.current = null;
    };
    // The map is created once; later changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin.
  useEffect(() => {
    const m = map.current;
    const leaflet = L.current;
    if (!ready || !m || !leaflet) return;
    if (!pin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = leaflet
        .marker([pin.lat, pin.lng], {
          draggable: editable,
          keyboard: false,
          icon: leaflet.divIcon({
            html: pinHtml(initial),
            className: 'savora-map-pin',
            iconSize: [40, 50],
            iconAnchor: [20, 49],
          }),
        })
        .addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng();
        onPinRef.current?.({
          lat: Number(p.lat.toFixed(6)),
          lng: Number(p.lng.toFixed(6)),
        });
      });
    } else {
      marker.current.setLatLng([pin.lat, pin.lng]);
      marker.current.setIcon(
        leaflet.divIcon({
          html: pinHtml(initial),
          className: 'savora-map-pin',
          iconSize: [40, 50],
          iconAnchor: [20, 49],
        }),
      );
    }
  }, [ready, pin, initial, editable]);

  // Delivery ring.
  useEffect(() => {
    const m = map.current;
    const leaflet = L.current;
    if (!ready || !m || !leaflet) return;
    if (!pin || !radiusM) {
      circle.current?.remove();
      circle.current = null;
      return;
    }
    if (!circle.current)
      circle.current = leaflet
        .circle([pin.lat, pin.lng], {
          radius: radiusM,
          color: '#db1a1a',
          weight: 1.5,
          dashArray: '4 5',
          fillColor: '#db1a1a',
          fillOpacity: 0.07,
          interactive: false,
        })
        .addTo(m);
    else circle.current.setLatLng([pin.lat, pin.lng]).setRadius(radiusM);
  }, [ready, pin, radiusM]);

  // Other branches, labelled with their distance from this one.
  useEffect(() => {
    const m = map.current;
    const leaflet = L.current;
    if (!ready || !m || !leaflet) return;
    const layer = leaflet.layerGroup(
      others.map((o) => {
        const km = pin ? ` · ${distanceKm(pin, o).toFixed(1)} km` : '';
        return leaflet.marker([o.lat, o.lng], {
          interactive: false,
          keyboard: false,
          icon: leaflet.divIcon({
            html: otherHtml(o.name + km),
            className: '',
            iconSize: [0, 0],
            iconAnchor: [6, 6],
          }),
        });
      }),
    );
    layer.addTo(m);
    return () => {
      layer.remove();
    };
  }, [ready, others, pin]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setSearchState('busy');
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}&lang=${locale}`);
      if (!res.ok) throw new Error(String(res.status));
      const { places } = (await res.json()) as {
        places: Array<{ label: string; lat: number; lng: number }>;
      };
      setResults(places);
      setSearchState(places.length ? 'idle' : 'empty');
    } catch {
      setResults(null);
      setSearchState('down');
    }
  }

  function choose(p: { lat: number; lng: number }) {
    const next = {
      lat: Number(p.lat.toFixed(6)),
      lng: Number(p.lng.toFixed(6)),
    };
    onPinRef.current?.(next);
    map.current?.setView([next.lat, next.lng], 17);
    setResults(null);
  }

  const control = 'grid size-[38px] place-items-center bg-surface text-ink transition-colors hover:bg-surface-2';

  return (
    <div className="savora-map relative isolate h-[340px] overflow-hidden rounded-[14px] border border-line bg-surface-2">
      <div ref={box} role="application" aria-label={label} className="absolute inset-0 z-0" />

      {search && editable && (
        <div className="absolute start-3 top-3 z-[500] w-[min(330px,calc(100%-72px))]">
          <form onSubmit={runSearch} role="search" className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-raised">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              aria-label={t.search}
              className="min-w-0 flex-1 bg-transparent text-caption font-semibold outline-none placeholder:font-normal placeholder:text-muted"
            />
            <kbd aria-hidden className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] font-bold text-muted">
              ⏎
            </kbd>
          </form>
          {(results?.length || searchState !== 'idle') && (
            <div role="status" className="mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-raised">
              {searchState === 'busy' && <p className="px-3 py-2.5 text-caption text-muted">{t.searching}</p>}
              {searchState === 'empty' && <p className="px-3 py-2.5 text-caption text-muted">{t.noResults}</p>}
              {searchState === 'down' && <p className="px-3 py-2.5 text-caption text-brand">{t.geocoderDown}</p>}
              {searchState === 'idle' &&
                results?.map((r, i) => (
                  <button key={i} type="button" onClick={() => choose(r)} className="block w-full border-t border-line px-3 py-2 text-start text-caption first:border-0 hover:bg-surface-2">
                    {r.label}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {editable && (
        <div className="absolute end-3 top-3 z-[500] grid overflow-hidden rounded-xl border border-line shadow-raised">
          <button type="button" aria-label={t.zoomIn} onClick={() => map.current?.zoomIn()} className={cx(control, 'border-b border-line')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button type="button" aria-label={t.zoomOut} onClick={() => map.current?.zoomOut()} className={cx(control, 'border-b border-line')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14" />
            </svg>
          </button>
          <button type="button" aria-label={t.recenter} disabled={!pin} onClick={() => pin && map.current?.setView([pin.lat, pin.lng], 16)} className={cx(control, 'text-brand disabled:text-muted')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
        </div>
      )}

      {editable && (
        <div className="absolute start-3 bottom-3 z-[500] flex max-w-[calc(100%-24px)] items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[11px] shadow-card">
          {pin ? (
            <>
              <span dir="ltr" className="font-mono font-semibold text-ink-2">
                {pin.lat.toFixed(4)}° N · {pin.lng.toFixed(4)}° E
              </span>
              <span aria-hidden className="h-3 w-px bg-line-2" />
              <span className="truncate text-muted">{t.pinHint}</span>
            </>
          ) : (
            <span className="font-semibold text-brand">{t.noPin}</span>
          )}
        </div>
      )}
    </div>
  );
}
