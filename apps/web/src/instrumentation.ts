import type { Instrumentation } from 'next';

/** Server errors as one JSON line each, so any log service (or plain `docker logs`) can search and
 *  alert on them. No request bodies or cookies are logged. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined;
  console.error(
    JSON.stringify({
      level: 'error',
      time: new Date().toISOString(),
      msg: 'request failed',
      app: 'savora-web',
      version: process.env.APP_VERSION ?? 'dev',
      method: request.method,
      path: request.path.split('?')[0],
      route: context.routePath,
      kind: context.routeType,
      digest,
      error: e.message,
      stack: e.stack?.split('\n').slice(0, 6).join('\n'),
    }),
  );
};
