import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Astro's `astro:*` virtual modules only exist inside an Astro build, so
    // tests cover the plain-TS lib layer, not pages/middleware.
    restoreMocks: true,
  },
});
