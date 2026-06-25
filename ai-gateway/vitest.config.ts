import { defineConfig } from 'vitest/config';

process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
