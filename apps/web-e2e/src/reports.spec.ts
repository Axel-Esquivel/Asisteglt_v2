import { Page, expect, test } from '@playwright/test';
import { TestUser } from './support/session';

/** Balance de saldos FICTICIO con encabezado de página repetido (solo para pruebas). */
const SAMPLE: string = [
  'EMPRESA DEMO, S.A.                                              Pagina:    1',
  'Emision:  05/03/26  09:15:02',
  'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
  '',
  '1.000.000.0000   ACTIVO                           5,200.00   1,300.00     450.00',
  '1.001.001.0000   CAJA Y BANCOS                    5,200.00   1,300.00     450.00',
  '1.001.001.0003      Caja chica                      200.00                 50.00',
  '1.001.001.0007      Banco Demo cuenta 1           5,000.00   1,300.00     400.00',
  '\fEMPRESA DEMO, S.A.                                              Pagina:    2',
  'Emision:  05/03/26  09:15:07',
  'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
  '2.001.001.0001      Proveedor Demo                (980.00)     120.00          ',
].join('\n');

const sampleFile = (name: string): { name: string; mimeType: string; buffer: Buffer } => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(SAMPLE, 'latin1'),
});

const addUnit = async (
  page: Page,
  button: string,
  code: string,
  name: string,
  currency: string,
): Promise<void> => {
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Código').fill(code);
  await dialog.getByLabel('Nombre').fill(name);
  if (currency !== '') {
    const tags = dialog.locator('#unitCurrencies');
    await tags.fill(currency);
    await tags.press('Enter');
  }
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('org-tree')).toContainText(name);
};

const assignBand = async (page: Page, band: number, label: string): Promise<void> => {
  await page.getByRole('combobox', { name: `Encabezado de la franja ${String(band)}` }).click();
  await page.getByRole('option', { name: new RegExp(`^${label} ·`) }).click();
};

test('configura un proyecto de reportes y carga un balance con el asistente', async ({
  page,
}): Promise<void> => {
  test.setTimeout(120_000);
  await TestUser.unique('Reportes').register(page);
  await page.goto('/app/projects');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const create = page.getByRole('dialog', { name: 'Nuevo proyecto' });
  await create.getByLabel('Nombre').fill('Balance ficticio');
  await create.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByRole('heading', { name: 'Balance ficticio' })).toBeVisible();

  // Estructura organizacional
  await page.getByRole('tab', { name: 'Estructura' }).click();
  await page.getByRole('button', { name: 'Agregar organización' }).click();
  const orgDialog = page.getByRole('dialog');
  await orgDialog.getByLabel('Código').fill('GRP');
  await orgDialog.getByLabel('Nombre').fill('Grupo Demo');
  await orgDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('org-tree')).toContainText('Grupo Demo');
  await addUnit(page, 'Agregar País en Grupo Demo', 'GT', 'Guatemala', 'GTQ');
  await addUnit(page, 'Agregar Compañía en Guatemala', 'DEMO-A', 'Demo A', '');

  // Catálogo desde plantilla
  await page.getByRole('tab', { name: 'Encabezados' }).click();
  await page.getByRole('button', { name: 'Desde plantilla' }).click();
  await page.getByRole('menuitem', { name: 'Plantilla contable' }).click();
  await expect(page.getByTestId('catalog-table')).toContainText('Saldo anterior');

  // Asistente de preconfiguración
  await page.getByRole('tab', { name: 'Preconfiguraciones' }).click();
  await page.getByRole('button', { name: 'Nueva preconfiguración' }).click();
  await page.getByLabel('Nombre (p. ej. balancetxt)').fill('balancetxt');
  await page.locator('input[type="file"]').setInputFiles(sampleFile('muestra.txt'));
  await expect(page.getByText('12 líneas')).toBeVisible();
  await page.getByRole('tab', { name: 'Divisorias' }).click();
  await page.getByRole('button', { name: 'Sugerir columnas' }).click();
  await expect(page.getByTestId('canvas-divider')).toHaveCount(4);
  await page.getByRole('tab', { name: 'Líneas' }).click();
  for (const line of [1, 2, 3]) {
    await page.getByRole('checkbox', { name: new RegExp(`^Línea ${String(line)} `) }).click();
  }
  await page.getByRole('button', { name: 'Ignorar como encabezado de página (3 líneas)' }).click();
  await expect(page.getByTestId('rules-table')).toContainText('Encabezado de página (3 líneas)');
  await page.getByRole('tab', { name: 'Encabezados' }).last().click();
  await assignBand(page, 1, 'Código de cuenta');
  await assignBand(page, 2, 'Nombre de cuenta');
  await assignBand(page, 3, 'Saldo anterior');
  await assignBand(page, 4, 'Debe');
  await assignBand(page, 5, 'Haber');
  await page.getByRole('tab', { name: 'Vista previa' }).click();
  await expect(page.getByTestId('preview-table')).toContainText('CAJA Y BANCOS');
  await expect(page.getByTestId('preview-table')).toContainText('-980');
  await page.getByRole('button', { name: 'Guardar y activar' }).click();
  await expect(page.getByTestId('profiles-table')).toContainText('Activa');

  // Carga múltiple
  await page.getByRole('tab', { name: 'Cargar datos' }).click();
  await page.locator('input[type="file"]').setInputFiles(sampleFile('balance_demo_2026_08.txt'));
  await expect(page.getByTestId('row-state-balance_demo_2026_08.txt')).toHaveText('Lista');
  await page.getByRole('button', { name: 'Cargar 1 archivos' }).click();
  await expect(page.getByTestId('status-balance_demo_2026_08.txt')).toHaveText('Publicado', {
    timeout: 15_000,
  });

  // Datos
  await page.getByRole('tab', { name: 'Datos', exact: true }).click();
  await expect(page.getByTestId('data-table')).toContainText('CAJA Y BANCOS');
  await expect(page.getByTestId('data-table')).toContainText('5,200');

  // Operaciones: campo calculado con fórmula por nombre
  await page.getByRole('tab', { name: 'Operaciones' }).click();
  await page.getByRole('button', { name: 'Agregar paso' }).click();
  const step = page.getByRole('dialog', { name: 'Paso' });
  await step.getByRole('button', { name: 'Nuevo encabezado…' }).click();
  const newField = page.getByRole('dialog', { name: 'Nuevo encabezado derivado' });
  await newField.getByLabel('Nombre').fill('Saldo final');
  await newField.getByRole('button', { name: 'Crear' }).click();
  await expect(newField).toBeHidden();
  await step.getByLabel('Fórmula').fill('=[saldo anterior] + [Debe] - [Nombre de cuenta]');
  await expect(step.getByTestId('formula-check')).not.toContainText('Resultado');
  await step.getByLabel('Fórmula').fill('=[saldo anterior] + [Debe] - [Haber]');
  await expect(step.getByTestId('formula-check')).toContainText('Resultado: Monto');
  await step.getByRole('button', { name: 'Aceptar' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('operations-table')).toContainText('=[Saldo anterior] + [Debe] - [Haber]');
  await page.getByRole('tab', { name: 'Datos', exact: true }).click();
  await expect(page.getByTestId('data-table')).toContainText('Saldo final');
  await expect(page.getByTestId('data-table')).toContainText('6,050');

  // Clasificación e informe
  await page.getByRole('tab', { name: 'Clasificaciones' }).click();
  await page.getByRole('button', { name: 'Nueva clasificación' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Balance general');
  await page.getByRole('combobox', { name: 'Clasificar por' }).click();
  await page.getByRole('option', { name: 'Código de cuenta' }).click();
  await page.getByRole('button', { name: 'Agregar nodo raíz' }).click();
  const node = page.getByRole('dialog', { name: 'Nodo' });
  await node.getByLabel('Nombre').fill('Activo');
  const patterns = node.locator('#nodePatterns');
  await patterns.fill('1.*');
  await patterns.press('Enter');
  await node.getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByTestId('classification-tree')).toContainText('1.*');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('classification-list')).toContainText('Balance general');

  await page.getByRole('tab', { name: 'Informes' }).click();
  await page.getByRole('button', { name: 'Nuevo informe' }).click();
  const design = page.getByRole('dialog', { name: 'Diseño del informe' });
  await design.getByLabel('Nombre').fill('Saldos por clasificación');
  await design.getByRole('combobox', { name: 'Clasificación' }).click();
  await page.getByRole('option', { name: 'Balance general' }).click();
  await design.locator('p-multiselect').click();
  for (const measure of ['Saldo anterior', 'Debe', 'Haber']) {
    await page.getByRole('option', { name: measure, exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await design.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('report-table')).toContainText('Activo');
  await expect(page.getByTestId('report-table')).toContainText('15,600.00');
  await expect(page.getByTestId('report-table')).toContainText('Sin clasificar');
});
