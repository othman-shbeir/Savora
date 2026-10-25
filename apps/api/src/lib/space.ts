import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { Worker } from 'node:worker_threads';
import { unzipSync } from 'fflate';
import { demoRoomPly } from './space-demo';

/**
 * Turning a walk-through video into a 3D model happens at a scanning service with GPUs. This is the
 * whole surface Savora needs from one, so the service can change without touching the routes.
 */
export type SpaceBuilder = {
  /** Stored with each build, so a later switch of service still finds old jobs. */
  name: string;
  /** Sends the video; returns the service's job id. */
  start: (video: { path: string; filename: string; mediaType: string }) => Promise<string>;
  check: (jobId: string) => Promise<{ state: 'queued' | 'processing' | 'ready' | 'failed' | 'expired' }>;
  /** The finished model: a splat file and its type. */
  fetchModel: (jobId: string) => Promise<{ data: Uint8Array; name: string }>;
};

/** The service refused the video (too long, too large, unreadable). Not worth retrying as is. */
export class SpaceRejected extends Error {}
/** Unreachable, rate limited or out of credit: worth trying again later. */
export class SpaceBusy extends Error {}

const SPLAT_FILE = /\.(spz|ply|splat|ksplat|sog)$/i;
/** Zips bigger than this are refused rather than unpacked in memory. */
const MAX_ZIP_BYTES = 1536 * 1024 * 1024;

/**
 * KIRI Engine's 3D Gaussian Splatting API (docs.kiriengine.app): upload a video, poll the job,
 * download a zip that holds the splat file. Its download links last an hour and its models three
 * days, so a finished model is fetched and stored here straight away.
 */
export function kiriSpaceBuilder(apiKey: string, opts: { fetch?: typeof fetch; base?: string } = {}): SpaceBuilder {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.base ?? 'https://api.kiriengine.app/api/v1/open';
  const auth = { authorization: `Bearer ${apiKey}` };

  async function json(res: Response) {
    const body = (await res.json().catch(() => null)) as { code?: number; msg?: string; ok?: boolean; data?: Record<string, unknown> } | null;
    if (res.status === 429 || res.status >= 500) throw new SpaceBusy(`kiri ${res.status}`);
    if (!res.ok || !body?.ok || body.code !== 0) throw new SpaceRejected(`kiri ${res.status}: ${body?.msg ?? 'request failed'}`);
    return body.data ?? {};
  }
  async function send(url: string, init?: RequestInit) {
    try {
      return await doFetch(url, { ...init, headers: { ...auth, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(30 * 60_000) });
    } catch (e) {
      throw new SpaceBusy(e instanceof Error ? e.message : 'unreachable');
    }
  }

  return {
    name: 'kiri',
    async start(video) {
      const { openAsBlob } = await import('node:fs');
      const form = new FormData();
      form.append('videoFile', await openAsBlob(video.path, { type: video.mediaType }), video.filename);
      // The splat itself is what guests walk through; a mesh and object masking aren't needed.
      form.append('isMesh', '0');
      form.append('isMask', '0');
      const data = await json(await send(`${base}/3dgs/video`, { method: 'POST', body: form }));
      if (typeof data.serialize !== 'string') throw new SpaceRejected('kiri: no serial number');
      return data.serialize;
    },
    async check(jobId) {
      const data = await json(await send(`${base}/model/getStatus?serialize=${encodeURIComponent(jobId)}`));
      // -1 uploading, 0 processing, 1 failed, 2 successful, 3 queuing, 4 expired.
      const map: Record<number, 'queued' | 'processing' | 'ready' | 'failed' | 'expired'> = { [-1]: 'processing', 0: 'processing', 1: 'failed', 2: 'ready', 3: 'queued', 4: 'expired' };
      return { state: map[Number(data.status)] ?? 'processing' };
    },
    async fetchModel(jobId) {
      const data = await json(await send(`${base}/model/getModelZip?serialize=${encodeURIComponent(jobId)}`));
      if (typeof data.modelUrl !== 'string') throw new SpaceBusy('kiri: no download link yet');
      let res: Response;
      try {
        // A pre-signed link: no API key.
        res = await doFetch(data.modelUrl, { signal: AbortSignal.timeout(30 * 60_000) });
      } catch (e) {
        throw new SpaceBusy(e instanceof Error ? e.message : 'download failed');
      }
      if (!res.ok) throw new SpaceBusy(`kiri download ${res.status}`);
      if (Number(res.headers.get('content-length') ?? 0) > MAX_ZIP_BYTES) throw new SpaceRejected('model too large');
      const zip = new Uint8Array(await res.arrayBuffer());
      return splatFromZip(zip);
    },
  };
}

/** The splat file inside a service's zip: the largest one, if there are several. */
export function splatFromZip(zip: Uint8Array): { data: Uint8Array; name: string } {
  if (zip.length > MAX_ZIP_BYTES) throw new SpaceRejected('model too large');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, { filter: (f) => SPLAT_FILE.test(f.name) && !f.name.startsWith('__MACOSX') });
  } catch {
    throw new SpaceRejected('unreadable zip');
  }
  const best = Object.entries(files).sort((a, b) => b[1].length - a[1].length)[0];
  if (!best) throw new SpaceRejected('no splat file in the zip');
  return { name: path.basename(best[0]), data: best[1] };
}

/**
 * Development and tests: "builds" a procedural café room after a short wait, so the whole flow
 * (upload, progress, levelling, tags, publishing, the guest viewer) works without a paid service.
 */
export function demoSpaceBuilder(opts: { delayMs?: number; clock?: () => number } = {}): SpaceBuilder {
  const delay = opts.delayMs ?? 15_000;
  const now = opts.clock ?? Date.now;
  return {
    name: 'demo',
    start: async () => `demo-${now()}`,
    check: async (jobId) => ({ state: now() - Number(jobId.slice(5)) >= delay ? 'ready' : 'processing' }),
    fetchModel: async () => ({ data: new Uint8Array(demoRoomPly()), name: 'demo-room.ply' }),
  };
}

// ---------- Compressing ----------

/** Compresses any splat file to .spz in a worker thread. An .spz is stored as it is. */
export async function toSpz(model: { data: Uint8Array; name: string }): Promise<Uint8Array> {
  if (/\.spz$/i.test(model.name)) return model.data;
  const copy = model.data.slice();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./space-transcode-worker.mjs', import.meta.url), { workerData: { bytes: copy, name: model.name }, transferList: [copy.buffer] });
    worker.once('message', (m: { ok: boolean; bytes?: Uint8Array; message?: string }) => {
      void worker.terminate();
      if (m.ok && m.bytes) resolve(m.bytes);
      else reject(new Error(m.message ?? 'transcode failed'));
    });
    worker.once('error', reject);
  });
}

// ---------- Storage ----------

/** Model files, by key. Local disk next to the photos; the same calls map onto object storage. */
export type ModelStore = {
  put: (key: string, data: Uint8Array) => Promise<void>;
  /** A stream of the file and its size, or null. */
  open: (key: string) => Promise<{ stream: Readable; bytes: number } | null>;
  remove: (key: string) => Promise<void>;
};

export const MODEL_KEY = /^[0-9a-f-]{36}\.spz$/;

export function diskModelStore(mediaDir = path.join(homedir(), '.savora', 'media')): ModelStore {
  const dir = path.join(mediaDir, 'spaces');
  const file = (key: string) => {
    if (!MODEL_KEY.test(key)) throw new Error('bad model key');
    return path.join(dir, key);
  };
  return {
    async put(key, data) {
      await mkdir(dir, { recursive: true });
      await writeFile(file(key), data);
    },
    async open(key) {
      if (!MODEL_KEY.test(key)) return null;
      try {
        const { size } = await stat(file(key));
        return { stream: createReadStream(file(key)), bytes: size };
      } catch {
        return null;
      }
    },
    async remove(key) {
      if (MODEL_KEY.test(key)) await rm(file(key), { force: true });
    },
  };
}
