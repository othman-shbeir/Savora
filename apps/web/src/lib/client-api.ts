/** Browser-side calls to the API through the /api proxy, so the session cookie rides along. */
export async function send<T = unknown>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.headers.get('content-type')?.includes('json') ? ((await res.json()) as T) : null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
