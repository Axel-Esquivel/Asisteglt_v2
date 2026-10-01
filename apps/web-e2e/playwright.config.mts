import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const workspaceRoot = join(import.meta.dirname, '..', '..');

const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4200';
// Permite usar un Chromium ya instalado (p. ej. CHROMIUM_PATH=/opt/pw-browsers/chromium).
const chromiumPath = process.env['CHROMIUM_PATH'] ?? '';
const isCi = (process.env['CI'] ?? '') !== '';

export default defineConfig({
  testDir: './src',
  outputDir: join(workspaceRoot, 'dist', '.playwright', 'apps', 'web-e2e', 'test-output'),
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: join(workspaceRoot, 'dist', '.playwright', 'apps', 'web-e2e', 'report'), open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx nx run web:serve',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath === '' ? {} : { launchOptions: { executablePath: chromiumPath } }),
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        ...(chromiumPath === '' ? {} : { launchOptions: { executablePath: chromiumPath } }),
      },
    },
  ],
});
