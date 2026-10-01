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

  // Colección de tipos de cambio y conversión a dólares
  await page.getByRole('tab', { name: 'Colecciones' }).click();
  await page.getByRole('button', { name: 'Nueva colección' }).click();
  await page.getByLabel('Nombre (p. ej. Tipo de cambio)').fill('Tipo de cambio');
  await page.getByRole('button', { name: 'Agregar campo' }).click();
  await page.getByLabel('Nombre del campo 1').fill('Moneda');
  await page.getByRole('combobox', { name: 'Tipo del campo 1' }).click();
  await page.getByRole('option', { name: 'Texto' }).click();
  await page.getByRole('button', { name: 'Agregar campo' }).click();
  await page.getByLabel('Nombre del campo 2').fill('Tasa de cierre');
  await page.getByRole('button', { name: 'Agregar fila' }).click();
  await page.getByLabel('Moneda de la fila 1').fill('GTQ');
  await page.getByLabel('Tasa de cierre de la fila 1').fill('8');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('collection-list')).toContainText('Tipo de cambio');

  await page.getByRole('tab', { name: 'Operaciones' }).click();
  await page.getByRole('button', { name: 'Agregar paso' }).click();
  await step.getByRole('combobox', { name: 'Tipo de paso' }).click();
  await page.getByRole('option', { name: 'Conversión de moneda' }).click();
  await step.getByRole('button', { name: 'Nuevo encabezado…' }).click();
  await newField.getByLabel('Nombre').fill('Saldo final USD');
  await newField.getByRole('button', { name: 'Crear' }).click();
  await expect(newField).toBeHidden();
  const choose = async (combobox: string, option: string): Promise<void> => {
    await step.getByRole('combobox', { name: combobox }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await choose('Encabezado que se convierte', 'Saldo final');
  await choose('Colección de tasas', 'Tipo de cambio');
  await choose('Campo de tasa', 'Tasa de cierre');
  await choose('Campo de moneda', 'Moneda');
  await step.getByLabel('Moneda destino (p. ej. USD)').fill('usd');
  await step.getByRole('button', { name: 'Aceptar' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('operations-table')).toContainText('a USD');
  await page.getByRole('tab', { name: 'Datos', exact: true }).click();
  await expect(page.getByTestId('data-table')).toContainText('Saldo final USD');
  await expect(page.getByTestId('data-table')).toContainText('756.25');

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
  await design.getByRole('button', { name: 'Agregar columna calculada' }).click();
  await design.getByLabel('Título de la columna 1').fill('Movimiento neto');
  await design.getByLabel('Fórmula de la columna 1').fill('=SUMA([Debe]) - SUMA([Haber])');
  await expect(design.getByTestId('column-check-0')).toContainText('Resultado: Monto');
  await design.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('report-table')).toContainText('Activo');
  await expect(page.getByTestId('report-table')).toContainText('15,600.00');
  await expect(page.getByTestId('report-table')).toContainText('Movimiento neto');
  await expect(page.getByTestId('report-table')).toContainText('2,670.00');
  await expect(page.getByTestId('report-table')).toContainText('Sin clasificar');

  // Validación de cuadre: el balance de muestra no cuadra (Debe ≠ Haber) y se rechaza
  await page.getByRole('tab', { name: 'Preconfiguraciones' }).click();
  await page.getByRole('button', { name: 'Validaciones de cuadre de balancetxt' }).click();
  const checks = page.getByRole('dialog', { name: 'Validaciones de cuadre' });
  await checks.getByRole('button', { name: 'Agregar validación' }).click();
  await checks.getByLabel('Nombre de la validación 1').fill('Debe = Haber');
  await checks.getByLabel('Fórmula izquierda 1').fill('=SUMA([Debe])');
  await checks.getByLabel('Fórmula derecha 1').fill('=SUMA([Haber])');
  await expect(checks.getByText('Resultado: Monto')).toHaveCount(2);
  await checks.getByRole('button', { name: 'Guardar validaciones' }).click();
  await expect(checks).toBeHidden();
  await expect(page.getByTestId('profiles-table')).toContainText('v2');

  await page.getByRole('tab', { name: 'Cargar datos' }).click();
  await page.locator('input[type="file"]').setInputFiles(sampleFile('balance_demo_2026_09.txt'));
  await expect(page.getByTestId('row-state-balance_demo_2026_09.txt')).toHaveText('Lista');
  await page.getByRole('button', { name: 'Cargar 1 archivos' }).click();
  await expect(page.getByTestId('status-balance_demo_2026_09.txt')).toHaveText('Con errores', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('checks-balance_demo_2026_09.txt')).toHaveText('No cuadra');
});
