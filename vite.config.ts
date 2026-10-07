import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/BattleSim/' : '/',
  worker: { format: 'es' },
  root: 'apps/web',
  envDir: '../..',
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001', '/ws': { target: 'ws://127.0.0.1:3001', ws: true } } },
  build: { outDir: '../../dist', emptyOutDir: true, target: 'es2022' },
}));
