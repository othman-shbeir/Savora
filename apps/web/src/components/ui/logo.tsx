import Image from 'next/image';

export function Logo({ width = 120 }: { width?: number }) {
  // The artwork is 600×176. The height attribute has to be a whole pixel, so the box is pinned to
  // both attributes (overriding the base `height: auto`) and the artwork is contained inside it:
  // no sub-pixel stretch, and the rendered size matches what Next.js expects.
  const height = Math.round((width * 176) / 600);
  return <Image src="/brand-logo.png" alt="Savora" width={width} height={height} style={{ width, height, objectFit: 'contain' }} priority />;
}
