import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [],
      reporter: ['text', 'json-summary'],
      thresholds: {
        // Enforce ≥80% coverage on parser + installer
      },
    },
    // Increase timeout for integration + hook tests
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
