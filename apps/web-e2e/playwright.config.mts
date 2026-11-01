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
    screenshot: 'only-on-failure',
    // Contra una compilación de producción (BASE_URL) el service worker atendería las peticiones y
    // `page.route` no podría simularlas; las pruebas fuera de línea usan la cola local, no el SW.
    serviceWorkers: 'block',
  },
  // API en memoria (sin MongoDB) + web con proxy /api → :3000.
  webServer: [
    {
      // Configuración «e2e»: apps/api/.env.serve.e2e (memoria, límite de intentos alto, sin datos
      // de demostración). No carga .env.development ni los .env.*.local de cada equipo.
      command: 'npx nx run api:serve:e2e',
      url: 'http://localhost:3000/api/v1/health',
      // Nunca reutilizar una API ya abierta (p. ej. `npm run start:api` con MongoDB): las pruebas
      // escribirían en esa base. Si el puerto está ocupado, Playwright se detiene con un aviso claro:
      // detén la API de desarrollo antes de `npm run e2e`.
      reuseExistingServer: false,
      cwd: workspaceRoot,
      timeout: 180_000,
      // Las variables de la terminal ganan a los archivos .env: se fijan las que protegen los datos
      // (p. ej. un DATA_STORE=mongo que quedó definido en la consola).
      env: { NODE_ENV: 'test', DATA_STORE: 'memory', DEMO_SEED: 'false', AUTH_RATE_LIMIT_PER_MINUTE: '1000' },
    },
    {
      command: 'npx nx run web:serve',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      cwd: workspaceRoot,
      timeout: 180_000,
    },
  ],
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
