import { defineConfig } from 'vitest/config';

// The first run opens an in-memory Postgres and applies every migration, which can take a while
// on a cold machine.
export default defineConfig({ test: { hookTimeout: 30_000 } });
