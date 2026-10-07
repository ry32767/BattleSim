import { defineConfig } from '@playwright/test';
const production = process.env.BATTLE_E2E_PRODUCTION === '1';
const port = production ? 3002 : 5173;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e', timeout: 90000, expect: { timeout: 15000 }, fullyParallel: false, workers: 1,
  use: { baseURL, viewport: { width: 1366, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: production ? 'npm start' : 'npm run dev', url: baseURL, env: production ? { PORT: String(port) } : {}, reuseExistingServer: true, timeout: 30000 },
});
