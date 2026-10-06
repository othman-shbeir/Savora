import QRCode from 'qrcode';

// Printable QR cards, drawn on a canvas at print resolution with the app's own fonts (Poppins and
// Tajawal). The same canvas is the on-screen preview, so the download is exactly what was shown.

export type CardFormat = 'table' | 'window' | 'takeaway';

/** Pixel size of each PNG (300 dpi) and the base layout grid it is drawn on (scaled 3x). */
export const FORMATS: Record<CardFormat, { w: number; h: number; inches: string }> = {
  table: { w: 1200, h: 1800, inches: '4 × 6 in' },
  window: { w: 1800, h: 1800, inches: '6 × 6 in' },
  takeaway: { w: 1800, h: 1200, inches: '6 × 4 in' },
};

export type CardData = {
  nameEn: string;
  nameAr: string | null;
  taglineEn: string | null;
  /** What the code opens. */
  url: string;
  /** The same link, short, printed under the code: savora.menu/r/saltandstem */
  displayUrl: string;
};

const C = { ink: '#242424', muted: '#757575', red: '#db1a1a', line: '#e7e7e7', redSoft: '#fdeded' };
const SCALE = 3;

/** Resolves next/font's generated family names and waits until both fonts can draw. */
async function fonts() {
  const css = getComputedStyle(document.documentElement);
  const latin = css.getPropertyValue('--font-poppins').trim() || 'sans-serif';
  const arabic = css.getPropertyValue('--font-tajawal').trim() || 'sans-serif';
  const family = `${latin}, ${arabic}, sans-serif`;
  await Promise.all(['400', '600', '700'].map((w) => document.fonts.load(`${w} 24px ${family}`, 'Savora سافورا')));
  return family;
}

/** The QR modules for a URL. Medium error correction: dense enough to stay small, sturdy enough
 *  for a scuffed table card. */
export function qrModules(url: string) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  return { size, dark: (r: number, c: number) => Boolean(qr.modules.data[r * size + c]) };
}

/** Vector QR (code only, 4-module quiet zone) for print shops that want to place it themselves. */
export function qrSvg(url: string) {
  return QRCode.toString(url, { type: 'svg', margin: 4, errorCorrectionLevel: 'M', color: { dark: C.ink, light: '#ffffff' } });
}

export async function drawCard(canvas: HTMLCanvasElement, format: CardFormat, d: CardData) {
  const { w, h } = FORMATS[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const family = await fonts();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const W = w / SCALE;
  const H = h / SCALE;

  const font = (size: number, weight = 400) => `${weight} ${size}px ${family}`;
  const text = (s: string, x: number, y: number, o: { size: number; weight?: number; color?: string; align?: CanvasTextAlign; rtl?: boolean; spacing?: number; max?: number }) => {
    let size = o.size;
    ctx.direction = o.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = o.align ?? 'left';
    ctx.fillStyle = o.color ?? C.ink;
    ctx.letterSpacing = `${o.spacing ?? 0}px`;
    ctx.font = font(size, o.weight);
    // Long names shrink to fit rather than run off the card.
    while (o.max && ctx.measureText(s).width > o.max && size > o.size * 0.6) ctx.font = font((size -= 0.5), o.weight);
    ctx.fillText(s, x, y);
    ctx.letterSpacing = '0px';
  };
  const qrBox = (x: number, y: number, side: number, pad: number) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, side, side, 18);
    ctx.fill();
    ctx.stroke();
    const { size, dark } = qrModules(d.url);
    const cell = (side - pad * 2) / size;
    ctx.fillStyle = C.ink;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        // Slight overlap avoids hairline gaps between modules when scaled.
        if (dark(r, c)) ctx.fillRect(x + pad + c * cell, y + pad + r * cell, cell + 0.15, cell + 0.15);
  };
  const logo = (cx: number, cy: number, r: number) => {
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textBaseline = 'middle';
    text(d.nameEn.slice(0, 1).toUpperCase(), cx, cy + 1, { size: r * 0.85, weight: 700, color: C.red, align: 'center' });
    ctx.textBaseline = 'alphabetic';
  };
  const arabicLine = d.nameAr ? `${d.nameAr} · امسح لعرض القائمة` : 'امسح لعرض القائمة';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  if (format === 'table') {
    // A quiet brand mark in the corner, away from the code and the printed link.
    ctx.strokeStyle = C.redSoft;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(W + 10, -20, 95, 0, Math.PI * 2);
    ctx.stroke();

    logo(59, 58, 19);
    text(d.nameEn, 90, 56, { size: 19, weight: 700, max: W - 140 });
    if (d.taglineEn) text(d.taglineEn, 90, 75, { size: 11.5, color: C.muted, max: W - 130 });
    qrBox(40, 112, W - 80, 22);
    text('SCAN TO VIEW THE MENU', W / 2, 476, { size: 12, weight: 700, color: C.red, align: 'center', spacing: 2.4 });
    text(arabicLine, W / 2, 500, { size: 13, color: C.muted, align: 'center', rtl: true, max: W - 80 });
    ctx.fillStyle = C.line;
    ctx.fillRect(40, 538, W - 80, 1);
    text(d.displayUrl, 40, 566, { size: 11, color: C.muted, max: W - 150 });
    text('savora', W - 40, 566, { size: 13, weight: 700, color: C.red, align: 'right' });
  } else if (format === 'window') {
    text('Our menu is one scan away', W / 2, 78, { size: 30, weight: 700, align: 'center', max: W - 80 });
    text('قائمتنا على بُعد مسحة واحدة', W / 2, 116, { size: 22, weight: 600, color: C.muted, align: 'center', rtl: true });
    qrBox(150, 150, 300, 24);
    logo(W / 2, 492, 17);
    text(d.nameAr ? `${d.nameEn} · ${d.nameAr}` : d.nameEn, W / 2, 538, { size: 18, weight: 700, align: 'center', max: W - 100 });
    text(d.displayUrl, W / 2, 568, { size: 12, color: C.muted, align: 'center' });
  } else {
    qrBox(36, 60, 280, 20);
    const x = 346;
    logo(x + 19, 96, 19);
    text(d.nameEn, x, 160, { size: 24, weight: 700, max: W - x - 30 });
    if (d.taglineEn) text(d.taglineEn, x, 184, { size: 12, color: C.muted, max: W - x - 30 });
    text('SCAN FOR THE MENU', x, 248, { size: 12, weight: 700, color: C.red, spacing: 2.2 });
    text(arabicLine, W - 30, 274, { size: 13, color: C.muted, align: 'right', rtl: true, max: W - x - 30 });
    ctx.fillStyle = C.line;
    ctx.fillRect(x, 304, W - x - 30, 1);
    text(d.displayUrl, x, 330, { size: 11, color: C.muted, max: W - x - 30 });
    text('savora', x, 354, { size: 13, weight: 700, color: C.red });
  }
}
