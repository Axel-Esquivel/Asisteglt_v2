import { expect, test } from '@playwright/test';
import { TestUser } from './support/session';

test('registro, recarga con sesión persistente, salida y nuevo ingreso', async ({ page }): Promise<void> => {
  const user: TestUser = TestUser.unique('Ana');
  await user.register(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: `Hola, ${user.displayName}` })).toBeVisible();
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/auth\/login$/);
  await user.login(page);
});

test('credenciales incorrectas muestran un error', async ({ page }): Promise<void> => {
  await page.goto('/auth/login');
  await page.getByLabel('Correo electrónico').fill('nadie@demo.test');
  await page.locator('#password').fill('ClaveIncorrecta2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('login-error')).toContainText('Correo o contraseña incorrectos');
});

test('el usuario cambia su nombre y ve sus sesiones', async ({ page }): Promise<void> => {
  const user: TestUser = TestUser.unique('Perfil');
  await user.register(page);
  await page.goto('/app/account');
  await page.getByLabel('Nombre').fill('Perfil Renombrado');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Perfil actualizado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toContainText('Perfil Renombrado');
  await expect(page.getByText('Esta sesión')).toBeVisible();
});
