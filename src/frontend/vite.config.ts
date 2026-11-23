import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5254';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      watch: {
        // inotify events don't pass through Windows/macOS bind mounts into Docker
        ...(env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : {}),
        // test output is not source: Playwright writes HTML traces there while a test runs, and Vite would reload
        // the page under test for every new HTML file
        ignored: ['**/e2e-results/**', '**/playwright-report/**', '**/test-results/**', '**/coverage/**'],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        // ULDK GUGiK parcel boundaries for outlining the clicked parcel (same-origin, no CORS issues)
        '/uldk': {
          target: 'https://uldk.gugik.gov.pl',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/uldk/, ''),
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
    },
  };
});
