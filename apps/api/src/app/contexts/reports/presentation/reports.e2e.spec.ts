import {
  CatalogFieldResponse,
  DataType,
  DerivedAttributeKind,
  FieldRole,
  FixedWidthSpec,
  NumericNature,
  OrgLevel,
} from '@asisteglt/shared-contracts';
import {
  ColumnDefaults,
  PageHeaderBlockRule,
  SkipBlankLinesRule,
  SkipPageBreaksRule,
  TextDocument,
  TextEncoding,
  TextLine,
} from '@asisteglt/shared-ingestion-core';
import request, { Response, Test } from 'supertest';
import { AuthenticatedClient, TestApp } from '../../../../testing/test-app';
import { ImportQueue } from '../domain/ports';

/** Balance FICTICIO de dos cuentas; `amount` permite generar versiones distintas del archivo. */
const balance = (amount: string): string =>
  [
    'EMPRESA DEMO, S.A.                                              Pagina:    1',
    'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
    '',
    `1.001.001.0000   CAJA Y BANCOS                  ${amount.padStart(10)}   1,300.00     450.00`,
    '1.001.001.0003      Caja chica                      200.00                 50.00',
  ].join('\n');

class Body {
  public static text(body: unknown, key: string): string {
    const value: unknown =
      typeof body === 'object' && body !== null && key in body ? Reflect.get(body, key) : null;
    if (typeof value !== 'string') {
      throw new Error(`Falta ${key}`);
    }
    return value;
  }

  public static list(body: unknown): unknown[] {
    if (!Array.isArray(body)) {
      throw new Error('Se esperaba una lista');
    }
    const items: unknown[] = body;
    return items;
  }
}

describe('Reportes: importación (e2e)', () => {
  let app: TestApp;
  let owner: AuthenticatedClient;
  let projectId: string;
  let profileId: string;
  let scope: Record<string, string | null>;

  const api = (path: string): string => `/api/v1/projects/${projectId}${path}`;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.start(null);
    owner = await app.register('analista@demo.test', 'Analista Demo');
    const project: Response = await request(app.server())
      .post('/api/v1/projects')
      .set('authorization', owner.bearer())
      .send({ name: 'Contabilidad ficticia', description: '', moduleType: 'REPORTS' })
      .expect(201);
    projectId = Body.text(project.body, 'id');
    const unit = async (
      level: OrgLevel,
      parentId: string | null,
      code: string,
      currencies: string[],
    ): Promise<string> => {
      const created: Response = await request(app.server())
        .post(api('/org-structure/units'))
        .set('authorization', owner.bearer())
        .send({ level, parentId, code, name: `Unidad ${code}`, currencies })
        .expect(201);
      return Body.text(created.body, 'id');
    };
    const organizationId: string = await unit(OrgLevel.ORGANIZATION, null, 'GRP', []);
    const countryId: string = await unit(OrgLevel.COUNTRY, organizationId, 'GT', ['GTQ', 'USD']);
    const companyId: string = await unit(OrgLevel.COMPANY, countryId, 'DEMO-A', []);
    scope = { organizationId, countryId, currency: 'GTQ', companyId, enterpriseId: null, branchId: null };
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('crea el catálogo desde una plantilla y valida nombres únicos', async (): Promise<void> => {
    const catalog: Response = await request(app.server())
      .post(api('/catalog/templates'))
      .set('authorization', owner.bearer())
      .send({ template: 'ACCOUNTING' })
      .expect(201);
    const catalogBody: unknown = catalog.body;
    expect(catalogBody).toMatchObject({ version: 8 });
    const duplicate: Response = await request(app.server())
      .post(api('/catalog/fields'))
      .set('authorization', owner.bearer())
      .send({
        label: '  DEBE ',
        origin: 'IMPORTED',
        role: 'DATA',
        dataType: 'DECIMAL',
        nature: 'AMOUNT',
        aggregation: null,
        describes: null,
        weightField: null,
      })
      .expect(409);
    const duplicateBody: unknown = duplicate.body;
    expect(duplicateBody).toMatchObject({ code: 'DUPLICATE_FIELD_LABEL' });
    await request(app.server())
      .post(api('/catalog/fields'))
      .set('authorization', owner.bearer())
      .send({
        label: '% margen',
        origin: 'IMPORTED',
        role: 'DATA',
        dataType: 'DECIMAL',
        nature: 'RATE',
        aggregation: 'SUM',
        describes: null,
        weightField: null,
      })
      .expect(400);
  });

  it('crea y activa una preconfiguración y procesa la carga múltiple', async (): Promise<void> => {
    const catalog: Response = await request(app.server())
      .get(api('/catalog'))
      .set('authorization', owner.bearer())
      .expect(200);
    const fields: CatalogFieldResponse[] = Body.list(Reflect.get(catalog.body, 'fields')).filter(
      (f: unknown): f is CatalogFieldResponse => typeof f === 'object' && f !== null && 'key' in f,
    );
    const key = (label: string): string => {
      const field: CatalogFieldResponse | null =
        fields.find((f: CatalogFieldResponse): boolean => f.label === label) ?? null;
      if (field === null) {
        throw new Error(`Sin ${label}`);
      }
      return field.key;
    };
    const document: TextDocument = TextDocument.fromText(balance('5,200.00'), TextEncoding.UTF8, 8);
    const header: TextLine[] = document
      .all()
      .slice(0, 2)
      .map((l: TextLine): TextLine => l);
    const spec: FixedWidthSpec = {
      encoding: 'auto',
      tabSize: 8,
      lineLength: document.maxLineLength(),
      dividers: [17, 47, 58, 69],
      rowRules: [
        new SkipBlankLinesRule().toSpec(),
        new SkipPageBreaksRule().toSpec(),
        PageHeaderBlockRule.fromLines(header).toSpec(),
      ],
      masks: [{ fieldKey: key('Código de cuenta'), pattern: '9.999.999.9999' }],
      columns: [
        ColumnDefaults.create(0, key('Código de cuenta'), FieldRole.IDENTIFIER, DataType.TEXT, null),
        ColumnDefaults.create(1, key('Nombre de cuenta'), FieldRole.IDENTIFIER_NAME, DataType.TEXT, null),
        ColumnDefaults.create(
          2,
          key('Saldo anterior'),
          FieldRole.DATA,
          DataType.DECIMAL,
          NumericNature.AMOUNT,
        ),
        ColumnDefaults.create(3, key('Debe'), FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT),
        ColumnDefaults.create(4, key('Haber'), FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT),
      ],
      derived: [
        {
          kind: DerivedAttributeKind.LEAF_FLAG,
          sourceKey: key('Código de cuenta'),
          targetKey: key('Es cuenta de detalle'),
          separator: '.',
          spacesPerLevel: 3,
        },
      ],
    };
    const created: Response = await request(app.server())
      .post(api('/profiles'))
      .set('authorization', owner.bearer())
      .send({
        name: 'balancetxt',
        description: 'Balance ficticio',
        extensions: ['txt', '.PRN'],
        fileNamePattern: 'balance_*.txt',
        spec,
      })
      .expect(201);
    const createdBody: unknown = created.body;
    expect(createdBody).toMatchObject({ status: 'DRAFT', extensions: ['.txt', '.prn'], version: 1 });
    profileId = Body.text(createdBody, 'id');
    await request(app.server())
      .post(api(`/profiles/${profileId}/activate`))
      .set('authorization', owner.bearer())
      .expect(201);

    const upload = (amount: string): Test =>
      request(app.server())
        .post(api('/imports'))
        .set('authorization', owner.bearer())
        .field(
          'manifest',
          JSON.stringify({
            items: [{ fileName: 'balance_demo.txt', profileId, period: '2026-08', ...scope }],
          }),
        )
        .attach('files', Buffer.from(balance(amount), 'latin1'), 'balance_demo.txt');

    const first: Response = await upload('5,200.00');
    expect(first.status).toBe(201);
    await app.app.get(ImportQueue).idle();
    const batch: Response = await request(app.server())
      .get(api(`/imports/${Body.text(first.body, 'id')}`))
      .set('authorization', owner.bearer())
      .expect(200);
    const batchBody: unknown = batch.body;
    expect(batchBody).toMatchObject({
      items: [{ status: 'PUBLISHED', data: 2, ignored: 3, rejected: 0, profileVersion: 1 }],
    });

    const records: Response = await request(app.server())
      .get(api('/records?period=2026-08'))
      .set('authorization', owner.bearer())
      .expect(200);
    const recordsBody: unknown = records.body;
    expect(recordsBody).toMatchObject({ total: 2 });
    const firstRow: unknown = Body.list(Reflect.get(records.body, 'rows'))[0];
    expect(firstRow).toMatchObject({
      values: { [key('Saldo anterior')]: '5200', [key('Es cuenta de detalle')]: false },
    });

    await upload('7,000.00').expect(201);
    await app.app.get(ImportQueue).idle();
    const replaced: Response = await request(app.server())
      .get(api('/records?period=2026-08'))
      .set('authorization', owner.bearer())
      .expect(200);
    const replacedBody: unknown = replaced.body;
    expect(replacedBody).toMatchObject({
      total: 2,
      rows: [{ values: { [key('Saldo anterior')]: '7000' } }, {}],
    });
    const history: Response = await request(app.server())
      .get(api('/imports'))
      .set('authorization', owner.bearer())
      .expect(200);
    expect(Body.list(history.body)).toEqual([
      expect.objectContaining({ items: [expect.objectContaining({ status: 'PUBLISHED' })] }),
      expect.objectContaining({ items: [expect.objectContaining({ status: 'SUPERSEDED' })] }),
    ]);
  });

  it('clasifica por código de cuenta y calcula el informe con subtotales y filtro de detalle', async (): Promise<void> => {
    const catalog: Response = await request(app.server())
      .get(api('/catalog'))
      .set('authorization', owner.bearer())
      .expect(200);
    const fields: CatalogFieldResponse[] = Body.list(Reflect.get(catalog.body, 'fields')).filter(
      (f: unknown): f is CatalogFieldResponse => typeof f === 'object' && f !== null && 'key' in f,
    );
    const key = (label: string): string => {
      const field: CatalogFieldResponse | null =
        fields.find((f: CatalogFieldResponse): boolean => f.label === label) ?? null;
      return field === null ? '' : field.key;
    };
    const classification: Response = await request(app.server())
      .post(api('/classifications'))
      .set('authorization', owner.bearer())
      .send({
        name: 'Balance general',
        fieldKey: key('Código de cuenta'),
        nodes: [
          { id: 'n1', parentId: null, code: '1', name: 'Activo', patterns: ['1.*'] },
          { id: 'n2', parentId: 'n1', code: '1.1', name: 'Caja y bancos', patterns: ['1.001.001.*'] },
        ],
      })
      .expect(201);
    await request(app.server())
      .post(api('/classifications'))
      .set('authorization', owner.bearer())
      .send({ name: 'Inválida', fieldKey: key('Debe'), nodes: [] })
      .expect(400);
    const base = {
      rowSource: 'CLASSIFICATION',
      classificationId: Body.text(classification.body, 'id'),
      rowFieldKey: null,
      measures: [key('Saldo anterior'), key('Debe'), key('Haber')],
      profileId: null,
      companyId: null,
      includeUnclassified: true,
    };
    const all: Response = await request(app.server())
      .post(api('/report-definitions'))
      .set('authorization', owner.bearer())
      .send({ ...base, name: 'Todo', onlyWhenFieldKey: null })
      .expect(201);
    const detail: Response = await request(app.server())
      .post(api('/report-definitions'))
      .set('authorization', owner.bearer())
      .send({ ...base, name: 'Solo detalle', onlyWhenFieldKey: key('Es cuenta de detalle') })
      .expect(201);
    const runAll: Response = await request(app.server())
      .get(api(`/report-definitions/${Body.text(all.body, 'id')}/run?period=2026-08`))
      .set('authorization', owner.bearer())
      .expect(200);
    const allBody: unknown = runAll.body;
    expect(allBody).toMatchObject({
      records: 2,
      rows: [
        { label: '1 Activo', level: 0, total: true, values: ['7200', '1300', '500'] },
        { label: '1.1 Caja y bancos', level: 1, values: ['7200', '1300', '500'] },
        { label: 'Total', total: true, values: ['7200', '1300', '500'] },
      ],
    });
    const runDetail: Response = await request(app.server())
      .get(api(`/report-definitions/${Body.text(detail.body, 'id')}/run?period=2026-08`))
      .set('authorization', owner.bearer())
      .expect(200);
    const detailBody: unknown = runDetail.body;
    expect(detailBody).toMatchObject({
      records: 1,
      rows: [{ values: ['200', '0', '50'] }, {}, { label: 'Total', values: ['200', '0', '50'] }],
    });
    await request(app.server())
      .post(api('/report-definitions'))
      .set('authorization', owner.bearer())
      .send({ ...base, name: 'Malo', measures: [key('Nombre de cuenta')], onlyWhenFieldKey: null })
      .expect(400);
  });

  it('aplica operaciones: campo calculado y acumulado del año en datos e informes', async (): Promise<void> => {
    const field = async (label: string): Promise<string> => {
      const created: Response = await request(app.server())
        .post(api('/catalog/fields'))
        .set('authorization', owner.bearer())
        .send({
          label,
          origin: 'DERIVED',
          role: 'DATA',
          dataType: 'DECIMAL',
          nature: 'AMOUNT',
          aggregation: null,
          describes: null,
          weightField: null,
        })
        .expect(201);
      return Body.text(created.body, 'key');
    };
    const finalKey: string = await field('Saldo final');
    const ytdKey: string = await field('Debe acumulado');
    const catalog: Response = await request(app.server())
      .get(api('/catalog'))
      .set('authorization', owner.bearer())
      .expect(200);
    const fields: CatalogFieldResponse[] = Body.list(Reflect.get(catalog.body, 'fields')).filter(
      (f: unknown): f is CatalogFieldResponse => typeof f === 'object' && f !== null && 'key' in f,
    );
    const keyOf = (label: string): string =>
      fields
        .filter((f: CatalogFieldResponse): boolean => f.label === label)
        .map((f: CatalogFieldResponse): string => f.key)[0] ?? '';
    const debeKey: string = keyOf('Debe');
    const step = (
      id: string,
      kind: string,
      targetKey: string,
      formula: string | null,
      sourceKey: string | null,
    ): Record<string, string | null> => ({
      id,
      kind,
      targetKey,
      formula,
      sourceKey,
      collectionId: null,
      rateFieldKey: null,
      targetCurrency: null,
    });

    const mismatch: Response = await request(app.server())
      .put(api('/operations'))
      .set('authorization', owner.bearer())
      .send({ steps: [step('s1', 'CALCULATED', finalKey, '=[Nombre de cuenta]', null)] })
      .expect(400);
    const mismatchBody: unknown = mismatch.body;
    expect(mismatchBody).toMatchObject({ code: 'TARGET_TYPE_MISMATCH' });

    const saved: Response = await request(app.server())
      .put(api('/operations'))
      .set('authorization', owner.bearer())
      .send({
        steps: [
          step('s1', 'CALCULATED', finalKey, '=[saldo anterior] + [Debe] - [Haber]', null),
          step('s2', 'YEAR_TO_DATE', ytdKey, null, debeKey),
        ],
      })
      .expect(200);
    const savedBody: unknown = saved.body;
    expect(savedBody).toMatchObject({
      version: 1,
      steps: [{ formula: '=[Saldo anterior] + [Debe] - [Haber]' }, { sourceKey: debeKey }],
    });

    await request(app.server())
      .post(api('/imports'))
      .set('authorization', owner.bearer())
      .field(
        'manifest',
        JSON.stringify({
          items: [{ fileName: 'balance_julio.txt', profileId, period: '2026-07', ...scope }],
        }),
      )
      .attach('files', Buffer.from(balance('5,000.00'), 'latin1'), 'balance_julio.txt')
      .expect(201);
    await app.app.get(ImportQueue).idle();

    const records: Response = await request(app.server())
      .get(api('/records?period=2026-08'))
      .set('authorization', owner.bearer())
      .expect(200);
    const firstRow: unknown = Body.list(Reflect.get(records.body, 'rows'))[0];
    expect(firstRow).toMatchObject({ values: { [finalKey]: '7850', [ytdKey]: '2600' } });

    const report: Response = await request(app.server())
      .post(api('/report-definitions'))
      .set('authorization', owner.bearer())
      .send({
        name: 'Saldos finales',
        rowSource: 'FIELD',
        classificationId: null,
        rowFieldKey: keyOf('Código de cuenta'),
        measures: [finalKey, ytdKey],
        profileId: null,
        companyId: null,
        onlyWhenFieldKey: null,
        includeUnclassified: true,
      })
      .expect(201);
    const run: Response = await request(app.server())
      .get(api(`/report-definitions/${Body.text(report.body, 'id')}/run?period=2026-08`))
      .set('authorization', owner.bearer())
      .expect(200);
    const runBody: unknown = run.body;
    expect(runBody).toMatchObject({ records: 2 });
    expect(Body.list(Reflect.get(run.body, 'rows'))).toContainEqual(
      expect.objectContaining({ values: ['7850', '2600'] }),
    );

    const inUse: Response = await request(app.server())
      .post(api(`/catalog/fields/${finalKey}/deactivate`))
      .set('authorization', owner.bearer())
      .expect(409);
    expect(Body.text(inUse.body, 'message')).toContain('Operación 1');
  });

  it('convierte moneda con una colección, calcula columnas con fórmula y no suma monedas distintas', async (): Promise<void> => {
    const catalog: Response = await request(app.server())
      .get(api('/catalog'))
      .set('authorization', owner.bearer())
      .expect(200);
    const fields: CatalogFieldResponse[] = Body.list(Reflect.get(catalog.body, 'fields')).filter(
      (f: unknown): f is CatalogFieldResponse => typeof f === 'object' && f !== null && 'key' in f,
    );
    const keyOf = (label: string): string =>
      fields
        .filter((f: CatalogFieldResponse): boolean => f.label === label)
        .map((f: CatalogFieldResponse): string => f.key)[0] ?? '';

    const rates = {
      name: 'Tipo de cambio',
      fields: [
        { key: '', label: 'Moneda', dataType: 'TEXT', nature: null },
        { key: '', label: 'Tasa de cierre', dataType: 'DECIMAL', nature: 'RATE' },
      ],
      rows: [],
    };
    await request(app.server())
      .post(api('/collections'))
      .set('authorization', owner.bearer())
      .send({ ...rates, fields: [rates.fields[0], { ...rates.fields[1], nature: null }] })
      .expect(400);
    const created: Response = await request(app.server())
      .post(api('/collections'))
      .set('authorization', owner.bearer())
      .send(rates)
      .expect(201);
    const collectionId: string = Body.text(created.body, 'id');
    const collectionFields: unknown[] = Body.list(Reflect.get(created.body, 'fields'));
    const currencyKey: string = Body.text(collectionFields[0], 'key');
    const rateKey: string = Body.text(collectionFields[1], 'key');
    await request(app.server())
      .put(api(`/collections/${collectionId}`))
      .set('authorization', owner.bearer())
      .send({
        ...rates,
        fields: [
          { ...rates.fields[0], key: currencyKey },
          { ...rates.fields[1], key: rateKey },
        ],
        rows: [
          { id: '', period: null, values: { [currencyKey]: 'GTQ', [rateKey]: '7.5' } },
          { id: '', period: '2026-08', values: { [currencyKey]: 'GTQ', [rateKey]: '8' } },
        ],
      })
      .expect(200);

    const usd: Response = await request(app.server())
      .post(api('/catalog/fields'))
      .set('authorization', owner.bearer())
      .send({
        label: 'Saldo final USD',
        origin: 'DERIVED',
        role: 'DATA',
        dataType: 'DECIMAL',
        nature: 'AMOUNT',
        aggregation: null,
        describes: null,
        weightField: null,
      })
      .expect(201);
    const usdKey: string = Body.text(usd.body, 'key');
    const current: Response = await request(app.server())
      .get(api('/operations'))
      .set('authorization', owner.bearer())
      .expect(200);
    const steps: unknown[] = Body.list(Reflect.get(current.body, 'steps'));
    const conversion = {
      id: 's3',
      kind: 'CURRENCY_CONVERSION',
      targetKey: usdKey,
      formula: null,
      sourceKey: keyOf('Saldo final'),
      collectionId,
      rateFieldKey: rateKey,
      currencyFieldKey: currencyKey,
      quote: 'UNITS_PER_TARGET',
      targetCurrency: 'usd',
    };
    await request(app.server())
      .put(api('/operations'))
      .set('authorization', owner.bearer())
      .send({ steps: [...steps, { ...conversion, rateFieldKey: currencyKey }] })
      .expect(400);
    await request(app.server())
      .put(api('/operations'))
      .set('authorization', owner.bearer())
      .send({ steps: [...steps, conversion] })
      .expect(200);

    const records: Response = await request(app.server())
      .get(api('/records?period=2026-08'))
      .set('authorization', owner.bearer())
      .expect(200);
    expect(Body.list(Reflect.get(records.body, 'rows'))[0]).toMatchObject({ values: { [usdKey]: '981.25' } });

    // Segunda compañía en dólares: sus montos no se suman con los quetzales.
    const company: Response = await request(app.server())
      .post(api('/org-structure/units'))
      .set('authorization', owner.bearer())
      .send({
        level: 'COMPANY',
        parentId: scope['countryId'],
        code: 'DEMO-B',
        name: 'Unidad DEMO-B',
        currencies: [],
      })
      .expect(201);
    await request(app.server())
      .post(api('/imports'))
      .set('authorization', owner.bearer())
      .field(
        'manifest',
        JSON.stringify({
          items: [
            {
              fileName: 'balance_usd.txt',
              profileId,
              period: '2026-08',
              ...scope,
              currency: 'USD',
              companyId: Body.text(company.body, 'id'),
            },
          ],
        }),
      )
      .attach('files', Buffer.from(balance('1,000.00'), 'latin1'), 'balance_usd.txt')
      .expect(201);
    await app.app.get(ImportQueue).idle();

    const consolidated = {
      name: 'Consolidado',
      rowSource: 'FIELD',
      classificationId: null,
      rowFieldKey: keyOf('Código de cuenta'),
      measures: [keyOf('Saldo final')],
      profileId: null,
      companyId: null,
      onlyWhenFieldKey: null,
      includeUnclassified: true,
      formulaColumns: [
        { label: 'Saldo en USD', formula: '=SUMA([Saldo final USD])' },
        { label: 'Movimiento neto', formula: '=SUMA([debe]) - SUMA([Haber])' },
      ],
    };
    const report: Response = await request(app.server())
      .post(api('/report-definitions'))
      .set('authorization', owner.bearer())
      .send(consolidated)
      .expect(201);
    const reportBody: unknown = report.body;
    expect(reportBody).toMatchObject({
      formulaColumns: [{ formula: '=SUMA([Saldo final USD])' }, { formula: '=SUMA([Debe]) - SUMA([Haber])' }],
    });
    await request(app.server())
      .post(api('/report-definitions'))
      .set('authorization', owner.bearer())
      .send({
        ...consolidated,
        name: 'Mala',
        formulaColumns: [{ label: 'X', formula: '=SUMA([Nombre de cuenta])' }],
      })
      .expect(400);
    const run: Response = await request(app.server())
      .get(api(`/report-definitions/${Body.text(report.body, 'id')}/run?period=2026-08`))
      .set('authorization', owner.bearer())
      .expect(200);
    const runBody: unknown = run.body;
    expect(runBody).toMatchObject({
      columns: [{ label: 'Saldo final' }, { label: 'Saldo en USD' }, { label: 'Movimiento neto' }],
    });
    const warnings: unknown[] = Body.list(Reflect.get(run.body, 'warnings'));
    expect(
      warnings.some(
        (w: unknown): boolean =>
          typeof w === 'string' && w.includes('«Saldo final» tiene montos en varias monedas (GTQ, USD)'),
      ),
    ).toBe(true);
    const total: unknown = Body.list(Reflect.get(run.body, 'rows')).at(-1);
    expect(total).toMatchObject({ label: 'Total', values: [null, '3000', null] });

    await request(app.server())
      .delete(api(`/collections/${collectionId}`))
      .set('authorization', owner.bearer())
      .expect(409);
  });

  it('valida el cuadre de cada archivo con fórmulas de la preconfiguración', async (): Promise<void> => {
    const setChecks = (checks: Array<Record<string, string | boolean>>): Test =>
      request(app.server())
        .put(api(`/profiles/${profileId}/checks`))
        .set('authorization', owner.bearer())
        .send({ checks });
    const check = (blocking: boolean): Record<string, string | boolean> => ({
      label: 'Debe = Haber',
      left: '=SUMA([debe])',
      right: '=SUMA([Haber])',
      tolerance: '0.01',
      blocking,
    });
    await setChecks([{ ...check(true), right: '=[Nombre de cuenta]' }]).expect(400);
    const notInSource: Response = await setChecks([{ ...check(true), right: '=SUMA([Saldo final])' }]).expect(
      400,
    );
    expect(Body.text(notInSource.body, 'message')).toContain('no se lee con esta preconfiguración');
    const saved: Response = await setChecks([
      check(true),
      {
        label: 'Movimiento',
        left: '=SUMA([Saldo anterior]) + SUMA([Debe]) - SUMA([Haber])',
        right: '=SUMA([Saldo anterior]) + 800',
        tolerance: '0',
        blocking: false,
      },
    ]).expect(200);
    const savedChecks: unknown[] = Body.list(Reflect.get(saved.body, 'checks'));
    expect(savedChecks).toHaveLength(2);
    expect(Body.text(savedChecks[0], 'left')).toMatch(/^=SUMA\(\[#/);

    const upload = async (fileName: string): Promise<unknown> => {
      const created: Response = await request(app.server())
        .post(api('/imports'))
        .set('authorization', owner.bearer())
        .field('manifest', JSON.stringify({ items: [{ fileName, profileId, period: '2026-09', ...scope }] }))
        .attach('files', Buffer.from(balance('2,000.00'), 'latin1'), fileName)
        .expect(201);
      await app.app.get(ImportQueue).idle();
      const batch: Response = await request(app.server())
        .get(api(`/imports/${Body.text(created.body, 'id')}`))
        .set('authorization', owner.bearer())
        .expect(200);
      return Body.list(Reflect.get(batch.body, 'items'))[0];
    };
    const rejected: unknown = await upload('balance_septiembre.txt');
    expect(rejected).toMatchObject({
      status: 'FAILED',
      error: 'No cuadra «Debe = Haber»: 1300 contra 500',
      checks: [
        { label: 'Debe = Haber', left: '1300', right: '500', passed: false, blocking: true },
        { label: 'Movimiento', passed: true },
      ],
    });
    const none: Response = await request(app.server())
      .get(api('/records?period=2026-09'))
      .set('authorization', owner.bearer())
      .expect(200);
    const noneBody: unknown = none.body;
    expect(noneBody).toMatchObject({ total: 0 });

    await setChecks([check(false)]).expect(200);
    const warned: unknown = await upload('balance_septiembre_b.txt');
    expect(warned).toMatchObject({ status: 'PUBLISHED', checks: [{ passed: false, blocking: false }] });
  });

  it('rechaza alcances incoherentes y marca como fallido un archivo con demasiados rechazos', async (): Promise<void> => {
    await request(app.server())
      .post(api('/imports'))
      .set('authorization', owner.bearer())
      .field(
        'manifest',
        JSON.stringify({
          items: [{ fileName: 'balance_x.txt', profileId, period: '2026-09', ...scope, currency: 'EUR' }],
        }),
      )
      .attach('files', Buffer.from(balance('1.00')), 'balance_x.txt')
      .expect(400);
    const bad: string = [
      '1.001.00         MAL FORMATO',
      '9.999            OTRA LINEA MALA',
      balance('1.00'),
    ].join('\n');
    const response: Response = await request(app.server())
      .post(api('/imports'))
      .set('authorization', owner.bearer())
      .field(
        'manifest',
        JSON.stringify({ items: [{ fileName: 'balance_bad.txt', profileId, period: '2026-09', ...scope }] }),
      )
      .attach('files', Buffer.from(bad), 'balance_bad.txt')
      .expect(201);
    await app.app.get(ImportQueue).idle();
    const batch: Response = await request(app.server())
      .get(api(`/imports/${Body.text(response.body, 'id')}`))
      .set('authorization', owner.bearer())
      .expect(200);
    const batchBody: unknown = batch.body;
    expect(batchBody).toMatchObject({
      items: [{ status: 'FAILED', rejected: 2, issues: [{ line: 1 }, { line: 2 }] }],
    });
  });
});
