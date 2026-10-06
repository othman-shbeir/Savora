import Image from 'next/image';

export function Logo({ width = 120 }: { width?: number }) {
  return <Image src="/brand-logo.png" alt="Savora" width={width} height={Math.round((width * 176) / 600)} priority />;
}
