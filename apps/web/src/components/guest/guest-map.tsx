'use client';

import { useEffect, useRef, useState } from 'react';
import type { Pin } from '../map/location-map';

/** A small, still map on the guest menu. Leaflet and the tiles load only when the card scrolls into
 *  view, so guests who never reach it don't pay for it on their data plan. */
export function GuestMap({ pin, radiusM, initial, label }: { pin: Pin; radiusM: number | null; initial: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [Map, setMap] = useState<typeof import('../map/location-map').LocationMap | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          import('../map/location-map').then((m) => setMap(() => m.LocationMap));
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className="h-[160px] [&_.savora-map]:h-[160px] [&_.savora-map]:rounded-none [&_.savora-map]:border-0">
      {Map && (
        <Map
          pin={pin}
          radiusM={radiusM}
          others={[]}
          initial={initial}
          label={label}
          locale="en"
          editable={false}
          t={{ zoomIn: '+', zoomOut: '−', recenter: '•', pinHint: '', noPin: '', search: '', searching: '', noResults: '', geocoderDown: '' }}
        />
      )}
    </div>
  );
}
