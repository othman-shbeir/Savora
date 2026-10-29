import path from 'node:path';
import type { NextConfig } from 'next';

// The monorepo keeps one .env at its root (the API reads it too). Next only reads this folder's, so
// load the root one as well; variables already set (e.g. by Docker) win. Absent in production images.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // No root .env: settings come from the environment.
}

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/** Sent with every page. Strict-Transport-Security only in production, where the site is HTTPS. */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ['@savora/shared'],
  // A self-contained server bundle for the Docker image (see Dockerfile.web).
  output: 'standalone',
  poweredByHeader: false,
  // Keep pages the owner has just seen in the browser for 30 seconds, so going back to one is
  // instant. Every save calls router.refresh(), which empties this cache, so edits never show stale.
  experimental: { staleTimes: { dynamic: 30 } },
  // Shared plan rules run in the browser too; make sure they see the same setting as the server.
  env: { NEXT_PUBLIC_PLANS_ENABLED: process.env.NEXT_PUBLIC_PLANS_ENABLED ?? 'true' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // The browser reaches the API through /api/* on the app's own origin, so the session cookie
  // is first-party and no cross-origin requests are needed.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
