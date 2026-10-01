import { Browser, BrowserContext, Page, expect, test } from '@playwright/test';
import { TestUser } from './support/session';

const createProject = async (page: Page, name: string, module: 'Reportes' | 'Inventarios'): Promise<void> => {
  await page.goto('/app/projects');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo proyecto' });
  await dialog.getByRole('button', { name: module }).click();
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Descripción').fill('Proyecto ficticio de prueba');
  await dialog.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
};

const newUserPage = async (
  browser: Browser,
  prefix: string,
): Promise<{ page: Page; context: BrowserContext; user: TestUser }> => {
  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();
  const user: TestUser = TestUser.unique(prefix);
  await user.register(page);
  return { page, context, user };
};

test('crea un proyecto, lo edita y lo ve en la lista', async ({ page }): Promise<void> => {
  const user: TestUser = TestUser.unique('Proyectos');
  await user.register(page);
  await createProject(page, 'Cierre ficticio 2026', 'Reportes');
  await expect(page.getByTestId('project-role')).toHaveText('Propietario');
  await page.getByLabel('Descripción').fill('Descripción actualizada');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Proyecto actualizado')).toBeVisible();
  await page.getByRole('button', { name: 'Volver a proyectos' }).click();
  await expect(page.getByTestId('projects-grid')).toContainText('Cierre ficticio 2026');
  await expect(page.getByTestId('projects-grid')).toContainText('Descripción actualizada');
});

test('invita con un vínculo y el invitado se une con el rol indicado', async ({ browser }): Promise<void> => {
  const owner = await newUserPage(browser, 'Duena');
  await createProject(owner.page, 'Toma física ficticia', 'Inventarios');
  await owner.page.getByRole('tab', { name: 'Compartir' }).click();
  await owner.page.getByRole('button', { name: 'Generar vínculo' }).click();
  const url: string = await owner.page.getByLabel('Vínculo generado').inputValue();
  expect(url).toContain('/app/join/');

  const guest = await newUserPage(browser, 'Invitado');
  await guest.page.goto(url);
  await expect(guest.page.getByRole('heading', { name: 'Toma física ficticia' })).toBeVisible();
  await expect(guest.page.getByTestId('project-role')).toHaveText('Contador');
  await expect(guest.page.getByRole('tab', { name: 'Compartir' })).toHaveCount(0);

  await owner.page.getByRole('tab', { name: 'Miembros' }).click();
  await expect(owner.page.getByTestId('members-table')).toContainText(guest.user.displayName);

  await guest.page.getByRole('tab', { name: 'Miembros' }).click();
  await guest.page.getByRole('button', { name: 'Salir del proyecto' }).click();
  await guest.page.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(guest.page).toHaveURL(/\/app\/projects$/);
  await expect(guest.page.getByTestId('projects-empty')).toBeVisible();

  await owner.context.close();
  await guest.context.close();
});

test('un vínculo inválido muestra un error', async ({ page }): Promise<void> => {
  await TestUser.unique('Vinculo').register(page);
  await page.goto('/app/join/token-inexistente');
  await expect(page.getByTestId('join-error')).toContainText('El vínculo no es válido');
});
