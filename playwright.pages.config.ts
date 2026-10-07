import { defineConfig } from '@playwright/test';

const remote = process.env.BATTLE_PAGES_URL;
export default defineConfig({
  testDir: './tests/pages',
  timeout: 180000,
  expect: { timeout: 30000 },
  workers: 1,
  use: {
    baseURL: remote ?? 'http://127.0.0.1:4173/BattleSim/',
    viewport: { width: 1366, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: remote ? undefined : {
    command: 'npx vite preview --mode pages --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/BattleSim/',
    reuseExistingServer: false,
  },
});
