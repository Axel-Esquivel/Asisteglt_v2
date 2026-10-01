import { expect, test } from '@playwright/test';
import { TestUser } from './support/session';

test('sin sesión, la aplicación redirige al login', async ({ page }): Promise<void> => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('muestra el estado de la API en el inicio', async ({ page }): Promise<void> => {
  await TestUser.unique('Estado').register(page);
  await expect(page.getByTestId('health-status')).toHaveText('Operativo');
});

test('informa cuando la API de estado falla', async ({ page }): Promise<void> => {
  await TestUser.unique('Falla').register(page);
  await page.route('**/api/v1/health', async (route): Promise<void> => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 503, code: 'API_DOWN', message: 'Servicio no disponible' }),
    });
  });
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByTestId('health-error')).toContainText('Servicio no disponible');
});

test('alterna el modo oscuro y abre la navegación', async ({ page }): Promise<void> => {
  await TestUser.unique('Tema').register(page);
  await page.getByRole('button', { name: 'Usar modo oscuro' }).click();
  await expect(page.locator('html')).toHaveClass(/app-dark/);
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Proyectos' })).toBeVisible();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Cerrar' })).toBeVisible();
});

test('muestra la página 404 en rutas desconocidas', async ({ page }): Promise<void> => {
  await page.goto('/ruta-inexistente');
  await expect(page.getByText('Página no encontrada')).toBeVisible();
});
