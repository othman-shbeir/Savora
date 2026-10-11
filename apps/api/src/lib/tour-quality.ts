import type { TourMeasure } from '@savora/shared';
import sharp from 'sharp';

/** Sharpness, brightness and size of a photo, measured on the original before it is shrunk.
 *  Sharpness is the variance of the Laplacian (edges) on a 1024px greyscale copy: shaken or
 *  out-of-focus photos have soft edges and score low. Throws if the file isn't an image. */
export async function measurePhoto(input: Buffer): Promise<TourMeasure> {
  const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  // EXIF orientations 5 to 8 are rotated a quarter turn.
  const turned = (meta.orientation ?? 1) >= 5;
  const width = (turned ? meta.height : meta.width) ?? 0;
  const height = (turned ? meta.width : meta.height) ?? 0;
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 }).rotate().greyscale().resize({ width: 1024, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let sum = 0;
  let sq = 0;
  let n = 0;
  let lum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = data[i - w]! + data[i + w]! + data[i - 1]! + data[i + 1]! - 4 * data[i]!;
      sum += v;
      sq += v * v;
      n++;
    }
  }
  for (let i = 0; i < data.length; i++) lum += data[i]!;
  const mean = n ? sum / n : 0;
  return { sharpness: Math.round((n ? sq / n - mean * mean : 0) * 10) / 10, brightness: Math.round(lum / Math.max(1, data.length)), width, height };
}
