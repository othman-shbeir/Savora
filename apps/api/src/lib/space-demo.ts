// A procedural café room as a 3D Gaussian Splatting .ply: what the development stand-in returns
// instead of a real scan, so the whole 3D walk-through can be tried without a scanning service.
// Y is up, metres, the room centred on the origin with the door at +Z.

/** Spherical-harmonics DC term: colour = 0.5 + C0 * f_dc. */
const C0 = 0.28209479177387814;

type Splat = { x: number; y: number; z: number; r: number; g: number; b: number; a: number; s: [number, number, number] };

/** A tiny deterministic random source, so the room is the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

export function demoRoomSplats(): Splat[] {
  const rand = rng(7);
  const out: Splat[] = [];
  const jitter = (c: [number, number, number], amount: number) => c.map((v) => Math.min(1, Math.max(0, v + (rand() - 0.5) * amount))) as [number, number, number];
  /** Fills a flat rectangle with overlapping flat splats. axis: the rectangle's normal. */
  function plane(axis: 'x' | 'y' | 'z', at: number, u: [number, number], v: [number, number], color: string, step = 0.06, vary = 0.08, pattern?: (a: number, b: number) => number) {
    const base = hex(color);
    for (let a = u[0]; a < u[1]; a += step) {
      for (let b = v[0]; b < v[1]; b += step) {
        const pa = a + rand() * step;
        const pb = b + rand() * step;
        const shade = pattern ? pattern(pa, pb) : 0;
        const [r, g, bl] = jitter(base.map((c) => c + shade) as [number, number, number], vary);
        const thin = 0.004;
        const size = step * 0.75;
        const p = axis === 'x' ? { x: at, y: pa, z: pb, s: [thin, size, size] } : axis === 'y' ? { x: pa, y: at, z: pb, s: [size, thin, size] } : { x: pa, y: pb, z: at, s: [size, size, thin] };
        out.push({ ...p, r, g, b: bl, a: 0.95, s: p.s as [number, number, number] });
      }
    }
  }
  /** A solid box made of its six faces. */
  function box(min: [number, number, number], max: [number, number, number], color: string, step = 0.04) {
    plane('y', max[1], [min[0], max[0]], [min[2], max[2]], color, step, 0.05);
    plane('x', min[0], [min[1], max[1]], [min[2], max[2]], color, step, 0.05, () => -0.08);
    plane('x', max[0], [min[1], max[1]], [min[2], max[2]], color, step, 0.05, () => -0.08);
    plane('z', min[2], [min[0], max[0]], [min[1], max[1]], color, step, 0.05, () => -0.05);
    plane('z', max[2], [min[0], max[0]], [min[1], max[1]], color, step, 0.05, () => -0.05);
  }
  /** A round table: a disc top on one leg. */
  function table(cx: number, cz: number) {
    const top = hex('#8a5a3b');
    for (let r = 0; r < 0.45; r += 0.035) {
      for (let t = 0; t < Math.PI * 2; t += 0.035 / Math.max(r, 0.035)) {
        const [cr, cg, cb] = jitter(top, 0.06);
        out.push({ x: cx + Math.cos(t) * r, y: 0.75, z: cz + Math.sin(t) * r, r: cr, g: cg, b: cb, a: 0.97, s: [0.03, 0.006, 0.03] });
      }
    }
    for (let y = 0; y < 0.74; y += 0.03) out.push({ x: cx, y, z: cz, r: 0.15, g: 0.12, b: 0.1, a: 0.97, s: [0.03, 0.02, 0.03] });
  }
  // Wooden floor with planks along X.
  plane('y', 0, [-4, 4], [-3, 3], '#9b6b45', 0.05, 0.06, (_a, b) => (Math.floor(b / 0.2) % 2 ? -0.05 : 0.02));
  // Warm stone walls and a darker ceiling.
  const stone = (a: number, b: number) => (Math.floor(a / 0.3) + Math.floor(b / 0.18)) % 3 === 0 ? -0.06 : 0;
  plane('z', -3, [-4, 4], [0, 3], '#c9a77f', 0.06, 0.1, stone);
  plane('z', 3, [-4, 4], [0, 3], '#c9a77f', 0.06, 0.1, (a, b) => (Math.abs(a) < 0.6 && b < 2.2 ? -0.45 : stone(a, b)));
  plane('x', -4, [0, 3], [-3, 3], '#c4a07a', 0.06, 0.1, stone);
  plane('x', 4, [0, 3], [-3, 3], '#c4a07a', 0.06, 0.1, stone);
  plane('y', 3, [-4, 4], [-3, 3], '#4a3a30', 0.08, 0.04);
  // A counter along the back wall, tables, and pendant lights.
  box([-2.5, 0, -2.9], [2.5, 1.05, -2.2], '#3b2b22');
  box([-2.5, 1.05, -2.95], [2.5, 1.1, -2.15], '#d8d2c6');
  for (const [x, z] of [[-2, 0], [0, 0.6], [2, 0], [-2, 1.9], [2, 1.9]] as const) table(x, z);
  for (const x of [-1.5, 0, 1.5]) {
    for (let y = 2.2; y < 3; y += 0.04) out.push({ x, y, z: -1.4, r: 0.1, g: 0.1, b: 0.1, a: 0.9, s: [0.006, 0.02, 0.006] });
    for (let i = 0; i < 60; i++) {
      const t = rand() * Math.PI * 2;
      const u = rand() * 2 - 1;
      const rr = 0.08 * Math.cbrt(rand());
      out.push({ x: x + rr * Math.sqrt(1 - u * u) * Math.cos(t), y: 2.1 + rr * u, z: -1.4 + rr * Math.sqrt(1 - u * u) * Math.sin(t), r: 1, g: 0.86, b: 0.55, a: 0.9, s: [0.03, 0.03, 0.03] });
    }
  }
  return out;
}

const FIELDS = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];

/** Encodes splats in the standard 3DGS .ply layout (binary little-endian floats). */
export function splatsToPly(splats: Splat[]): Buffer {
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${splats.length}\n${FIELDS.map((f) => `property float ${f}`).join('\n')}\nend_header\n`;
  const body = Buffer.alloc(splats.length * FIELDS.length * 4);
  let o = 0;
  const logit = (a: number) => Math.log(a / (1 - a));
  for (const s of splats) {
    const alpha = Math.min(0.995, Math.max(0.005, s.a));
    // Position, an unused normal, colour, opacity, log scales, then an identity rotation (w first).
    const values = [s.x, s.y, s.z, 0, 0, 0, (s.r - 0.5) / C0, (s.g - 0.5) / C0, (s.b - 0.5) / C0, logit(alpha), ...s.s.map(Math.log), 1, 0, 0, 0];
    for (const v of values) {
      body.writeFloatLE(v, o);
      o += 4;
    }
  }
  return Buffer.concat([Buffer.from(header, 'ascii'), body]);
}

export const demoRoomPly = () => splatsToPly(demoRoomSplats());
