import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/vitest.setup.js'],
    include: ['test/integration/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    // Keep it fast and deterministic in CI.
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
});
