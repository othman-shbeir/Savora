import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';

export const MEDIA_SIZES = ['full', 'thumb'] as const;
export type MediaSize = (typeof MEDIA_SIZES)[number];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Where processed images live. Local disk now; the same two calls map onto object storage later. */
export type MediaStore = {
  put: (id: string, size: MediaSize, data: Buffer) => Promise<void>;
  get: (id: string, size: MediaSize) => Promise<Buffer | null>;
};

/** MEDIA_DIR, defaulting to ~/.savora/media so uploads stay out of synced folders like OneDrive. */
export function diskStore(dir = path.join(homedir(), '.savora', 'media')): MediaStore {
  const file = (id: string, size: MediaSize) => path.join(dir, `${id}-${size}.webp`);
  return {
    async put(id, size, data) {
      await mkdir(dir, { recursive: true });
      await writeFile(file(id, size), data);
    },
    async get(id, size) {
      try {
        return await readFile(file(id, size));
      } catch {
        return null;
      }
    },
  };
}

export class NotAnImage extends Error {}

/** Normalises an upload: honours the camera's rotation, strips metadata (including GPS), and writes
 *  a WebP for the guest menu (1600px, or larger for tour scenes) plus a 480px square thumbnail. */
export async function processImage(input: Buffer, maxSize = 1600) {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new NotAnImage();
  }
  if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif', 'gif', 'tiff'].includes(meta.format)) throw new NotAnImage();
  const base = () => sharp(input, { limitInputPixels: 50_000_000 }).rotate();
  try {
    const { data: full, info } = await base().resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const thumb = await base().resize({ width: 480, height: 480, fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 78 }).toBuffer();
    return { full, thumb, width: info.width, height: info.height };
  } catch {
    // Recognised but undecodable, e.g. an iPhone HEIC this build of libvips can't read.
    throw new NotAnImage();
  }
}
