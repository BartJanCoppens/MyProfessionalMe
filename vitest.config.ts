import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Unit and component tests. Nothing here reaches Supabase: src/test/setup.ts swaps the client for an in-memory fake.
// The env gives src/lib/supabase.ts the variables it requires, so tests also run in a checkout without .env.local.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'text', 'json-summary'],
    },
  },
}));
