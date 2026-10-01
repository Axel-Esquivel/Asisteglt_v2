import { Browser, BrowserContext, Page, expect, test } from '@playwright/test';
import { TestUser } from './support/session';

/** Ítems FICTICIOS de una bodega de pruebas. */
const ITEMS: string = [
  'SKU;Descripción;Unidad;Ubicación;Existencia;Costo',
  'P-001;Tornillo demo;u;A-01;100;0.50',
  'P-002;Tuerca demo;u;A-02;40;0.25',
].join('\n');

interface Actor {
  readonly page: Page;
  readonly context: BrowserContext;
}

const actor = async (browser: Browser, prefix: string): Promise<Actor> => {
  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();
  await TestUser.unique(prefix).register(page);
  return { page, context };
};

test('toma física con conteo a ciegas y supervisión en vivo', async ({ browser }): Promise<void> => {
  test.setTimeout(120_000);
  const chief: Actor = await actor(browser, 'Jefa');
  const { page } = chief;
  await page.goto('/app/projects');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo proyecto' });
  await dialog.getByRole('button', { name: 'Inventarios' }).click();
  await dialog.getByLabel('Nombre').fill('Inventario ficticio');
  await dialog.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByRole('heading', { name: 'Inventario ficticio' })).toBeVisible();

  await page.getByRole('tab', { name: 'Compartir' }).click();
  await page.getByRole('button', { name: 'Generar vínculo' }).click();
  const url: string = await page.getByLabel('Vínculo generado').inputValue();
  const counter: Actor = await actor(browser, 'Contador');
  await counter.page.goto(url);
  await expect(counter.page.getByTestId('project-role')).toHaveText('Contador');

  await page.getByRole('tab', { name: 'Tomas' }).click();
  await page.getByRole('button', { name: 'Nueva toma' }).click();
  const create = page.getByRole('dialog', { name: 'Nueva toma' });
  await create.getByLabel('Nombre de la toma').fill('Bodega demo');
  await create.getByLabel('Bodega', { exact: true }).fill('Central');
  await create.getByRole('button', { name: 'Crear toma' }).click();
  await expect(page.getByTestId('count-status')).toHaveText('En preparación');

  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'items.csv', mimeType: 'text/csv', buffer: Buffer.from(ITEMS) });
  await page.getByRole('button', { name: 'Cargar 2 ítems' }).click();
  await expect(page.getByText('2 ítems', { exact: true })).toBeVisible();
  await expect(page.getByTestId('participants-table')).toContainText('Contador Demo');
  await page.getByRole('button', { name: 'Guardar participantes' }).click();
  await expect(page.getByText('Participantes guardados')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar toma' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByTestId('count-status')).toHaveText('En curso');
  await page.getByRole('tab', { name: 'Supervisión' }).click();
  await expect(page.getByTestId('kpi-counted')).toHaveText('0 / 2');

  await counter.page.getByRole('tab', { name: 'Tomas' }).click();
  await counter.page.getByTestId('counts-table').getByRole('button', { name: 'Abrir' }).click();
  await expect(counter.page.getByTestId('work-items')).toContainText('Tornillo demo');
  await expect(counter.page.getByTestId('work-items')).not.toContainText('100');
  await counter.page.getByLabel('Cantidad de P-001').fill('95');
  await counter.page.getByRole('button', { name: 'Guardar conteo de P-001' }).click();
  await counter.page.getByLabel('Cantidad de P-002').fill('40');
  await counter.page.getByRole('button', { name: 'Guardar conteo de P-002' }).click();

  await expect(page.getByTestId('kpi-counted')).toHaveText('2 / 2');
  await expect(page.getByTestId('kpi-exceeding')).toHaveText('1');
  await expect(page.getByTestId('supervision-table')).toContainText('-2.50');

  await chief.context.close();
  await counter.context.close();
});
