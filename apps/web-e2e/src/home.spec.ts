import { Page, expect, test } from '@playwright/test';

const HEALTH_OK: Readonly<Record<string, string | number>> = {
  service: 'api',
  status: 'UP',
  version: '0.1.0',
  environment: 'e2e',
  uptimeSeconds: 125,
  timestamp: '2026-10-01T12:00:00.000Z',
};

async function mockHealth(page: Page, status: number, body: Readonly<Record<string, string | number>>): Promise<void> {
  await page.route('**/api/v1/health', async (route): Promise<void> => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('muestra el estado operativo de la API', async ({ page }): Promise<void> => {
  await mockHealth(page, 200, HEALTH_OK);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bienvenido a AsisteGLT' })).toBeVisible();
  await expect(page.getByTestId('health-status')).toHaveText('Operativo');
  await expect(page.getByTestId('health-facts')).toContainText('2 min 5 s');
});

test('informa cuando la API no responde', async ({ page }): Promise<void> => {
  await mockHealth(page, 503, { statusCode: 503, code: 'API_DOWN', message: 'Servicio no disponible' });
  await page.goto('/');
  await expect(page.getByTestId('health-error')).toContainText('Servicio no disponible');
});

test('alterna el modo oscuro y abre la navegación', async ({ page }): Promise<void> => {
  await mockHealth(page, 200, HEALTH_OK);
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar modo oscuro' }).click();
  await expect(page.locator('html')).toHaveClass(/app-dark/);
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Inventarios' })).toBeVisible();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Cerrar' })).toBeVisible();
});

test('muestra la página 404 en rutas desconocidas', async ({ page }): Promise<void> => {
  await mockHealth(page, 200, HEALTH_OK);
  await page.goto('/ruta-inexistente');
  await expect(page.getByText('Página no encontrada')).toBeVisible();
});
