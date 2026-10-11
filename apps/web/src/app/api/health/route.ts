const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/** One address for uptime monitors: the web app answers, and reports whether the API and its
 *  database do too. 503 when anything guests depend on is down. */
export async function GET() {
  let api: { ok: boolean; db?: string; version?: string } = { ok: false };
  try {
    const res = await fetch(`${API_ORIGIN}/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    api = await res.json();
  } catch {
    // Unreachable: reported below.
  }
  const ok = api.ok === true;
  return Response.json({ ok, web: { version: process.env.APP_VERSION ?? 'dev' }, api }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
