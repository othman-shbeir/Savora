// Runs in a worker thread: compresses a splat model (.ply, .splat, …) to .spz with Spark, so a
// large scan never blocks the API's event loop. Plain JavaScript so it loads the same way under
// tsx in development and node in production.
import { parentPort, workerData } from 'node:worker_threads';
import { transcodeSpz } from '@sparkjsdev/spark';

const { bytes, name } = workerData;
try {
  // One band of view-dependent colour keeps scans lively at a fraction of the size of three.
  const { fileBytes } = await transcodeSpz({ inputs: [{ fileBytes: new Uint8Array(bytes), pathOrUrl: name }], maxSh: 1 });
  const out = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
  parentPort.postMessage({ ok: true, bytes: out }, [out.buffer]);
} catch (e) {
  parentPort.postMessage({ ok: false, message: e instanceof Error ? e.message : String(e) });
}
