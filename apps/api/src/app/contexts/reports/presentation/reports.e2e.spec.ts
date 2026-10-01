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
