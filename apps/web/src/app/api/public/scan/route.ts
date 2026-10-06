import type { NextRequest } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/**
 * The guest page's "menu opened" signal. It takes priority over the /api rewrite because the
 * rewrite proxy doesn't pass on the guest's address, and without it every phone would look like
 * the same visitor. The address is used only for the API's rate limit and its same-visit check,
 * never stored.
 */
export async function POST(request: NextRequest) {
  // Next fills x-forwarded-for from the socket when nothing in front of it did. A trusted proxy
  // in front appends the address it saw, so the right-most entry is the one to believe.
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',').at(-1)?.trim() ?? '';
  try {
    await fetch(`${API_ORIGIN}/public/scan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': request.headers.get('user-agent') ?? '',
        cookie: request.headers.get('cookie') ?? '',
        ...(ip ? { 'x-forwarded-for': ip } : {}),
      },
      body: (await request.text()).slice(0, 1000),
      cache: 'no-store',
    });
  } catch {
    // Analytics must never break the menu.
  }
  return new Response(null, { status: 204 });
}
