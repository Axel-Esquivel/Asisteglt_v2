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
  await page.getByRole('button', { name: 'Abrir en otro dispositivo' }).click();
  const qr = page.getByRole('dialog', { name: 'Abrir en otro dispositivo' });
  await expect(qr.getByTestId('access-qr')).toBeVisible();
  await expect(qr).toContainText('usa «localhost»');
  await qr.getByLabel('Enlace').fill('http://192.168.1.20:4200/app');
  await expect(qr).not.toContainText('usa «localhost»');
  await page.keyboard.press('Escape');

  await counter.page.getByRole('tab', { name: 'Tomas' }).click();
  await counter.page.getByTestId('counts-table').getByRole('button', { name: 'Abrir' }).click();
  await expect(counter.page.getByTestId('work-items')).toContainText('Tornillo demo');
  await expect(counter.page.getByTestId('work-items')).not.toContainText('100');
  // Sin conexión: el conteo se guarda en el dispositivo y se envía al volver la red
  await counter.context.setOffline(true);
  await counter.page.getByLabel('Cantidad de P-001').fill('95');
  await counter.page.getByRole('button', { name: 'Guardar conteo de P-001' }).click();
  await expect(counter.page.getByTestId('pending-P-001')).toBeVisible();
  await expect(counter.page.getByTestId('pending-banner')).toContainText('1 conteos guardados');
  await counter.context.setOffline(false);
  await expect(counter.page.getByTestId('pending-banner')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByTestId('kpi-counted')).toHaveText('1 / 2');
  await counter.page.getByTestId('work-P-002').getByRole('button', { name: 'No está' }).click();
  await expect(counter.page.getByLabel('Cantidad de P-002')).toBeDisabled();
  await counter.page.getByLabel('Comentario de P-002').fill('Estante vacío');
  await counter.page.getByRole('button', { name: 'Guardar conteo de P-002' }).click();

  await expect(page.getByTestId('kpi-counted')).toHaveText('2 / 2');
  await expect(page.getByTestId('kpi-exceeding')).toHaveText('2');
  await expect(page.getByTestId('kpi-issues')).toHaveText('1');
  await expect(page.getByTestId('kpi-difference')).toHaveText('-12.50');
  await expect(page.getByTestId('kpi-valuation')).toHaveText('60.00 · 47.50 · 0.00');
  await expect(page.getByTestId('supervision-table')).toContainText('No encontrado');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar resultados (CSV)' }).click();
  const file: string = await (await download).path();
  const { readFileSync } = await import('node:fs');
  const csv: string = readFileSync(file, 'utf8');
  expect(csv).toContain('P-002;Tuerca demo;40;0;-40;-10.00;No encontrado;Estante vacío');
  expect(csv).toContain('Diferencia valorizada;-12.50');

  await chief.context.close();
  await counter.context.close();
});
