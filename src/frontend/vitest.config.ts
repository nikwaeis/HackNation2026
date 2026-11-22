import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit + component tests (jsdom). External services are always mocked — see src/test/*.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
});
