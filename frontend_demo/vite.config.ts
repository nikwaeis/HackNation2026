import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dev only: where the Vite server forwards /api requests (ASP.NET Core API).
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5254';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5173,
      // inotify events don't pass through Windows/macOS bind mounts into Docker
      watch: env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
      },
    },
    preview: { port: 4173 },
  };
});
