import {
  Aggregation,
  ComputedReportResponse,
  DataColumnDto,
  DataColumnKind,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
  OrgLevel,
  PeriodGrouping,
  PeriodValue,
  ReportDefinitionRequest,
  ReportRowResponse,
  RowSource,
} from '@asisteglt/shared-contracts';
import { EntityId, FixedClock, Nullable } from '@asisteglt/shared-kernel';
import { Classification } from './classification';
import { ColumnSplit, DataScope } from './data-scope';
import { CatalogFieldSnapshot, FieldCatalog } from './field-catalog';
import { OrgStructure } from './org-structure';
import { PeriodWindow } from './period-window';
import { DataRecordSnapshot } from './ports';
import { ReportDefinition } from './report-definition';
import { ReportEngine, TableWindows } from './report-engine';

/** Datos FICTICIOS: dos compañías de una organización con saldos y movimientos mensuales. */
const projectId: EntityId = EntityId.generate();

const field = (
  key: string,
  label: string,
  role: FieldRole,
  dataType: DataType,
  nature: Nullable<NumericNature>,
  describes: Nullable<string>,
): CatalogFieldSnapshot => ({
  key,
  label,
  origin: FieldOrigin.IMPORTED,
  role,
  dataType,
  nature,
  aggregation: nature === null ? Aggregation.NONE : Aggregation.SUM,
  describes,
  weightField: null,
  active: true,
});

const catalog: FieldCatalog = FieldCatalog.restore({
  id: EntityId.generate().toString(),
  projectId: projectId.toString(),
  version: 1,
  fields: [
    field('f_acc', 'Número de cuenta', FieldRole.IDENTIFIER, DataType.TEXT, null, null),
    field('f_name', 'Nombre de cuenta', FieldRole.IDENTIFIER_NAME, DataType.TEXT, null, 'f_acc'),
    field('f_bal', 'Saldo', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null),
    field('f_mov', 'Mes', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null),
  ],
});

const org: OrgStructure = OrgStructure.restore({
  id: EntityId.generate().toString(),
  projectId: projectId.toString(),
  units: [
    {
      id: 'org',
      level: OrgLevel.ORGANIZATION,
      parentId: null,
      code: 'GRP',
      name: 'Grupo Demo',
      currencies: [],
    },
    {
      id: 'gt',
      level: OrgLevel.COUNTRY,
      parentId: 'org',
      code: 'GT',
      name: 'País Demo',
      currencies: ['GTQ'],
    },
    { id: 'a', level: OrgLevel.COMPANY, parentId: 'gt', code: 'A', name: 'Compañía A', currencies: [] },
    { id: 'b', level: OrgLevel.COMPANY, parentId: 'gt', code: 'B', name: 'Compañía B', currencies: [] },
  ],
});

const classification: Classification = Classification.restore({
  id: EntityId.generate().toString(),
  projectId: projectId.toString(),
  name: 'Balance',
  fieldKey: 'f_acc',
  nodes: [{ id: 'n1', parentId: null, code: '1', name: 'Activo', patterns: ['1*'] }],
  updatedAt: new Date(0),
});

let line: number = 0;
const record = (
  period: string,
  companyId: string,
  balance: string,
  movement: Nullable<string>,
): DataRecordSnapshot => {
  line += 1;
  return {
    id: `r${String(line)}`,
    projectId: projectId.toString(),
    loadId: `load-${companyId}-${period}`,
    profileId: 'p',
    period,
    organizationId: 'org',
    countryId: 'gt',
    currency: 'GTQ',
    companyId,
    enterpriseId: null,
    branchId: null,
    line,
    values: { f_acc: '1101', f_name: 'Caja', f_bal: balance, f_mov: movement },
  };
};

const RECORDS: DataRecordSnapshot[] = [
  record('2025-12', 'a', '100', '5'),
  record('2026-01', 'a', '110', '10'),
  record('2026-02', 'a', '130', '20'),
  record('2026-03', 'a', '160', '30'),
  record('2025-12', 'b', '35', '1'),
  record('2026-03', 'b', '40', '5'),
];

const measure = (fieldKey: string, periodValue: PeriodValue, periodOffset: number): DataColumnDto => ({
  kind: DataColumnKind.MEASURE,
  label: '',
  fieldKey,
  formula: null,
  periodValue,
  periodOffset,
});

const request = (overrides: Partial<ReportDefinitionRequest>): ReportDefinitionRequest => ({
  name: 'Balance comparativo',
  rowSource: RowSource.FIELD,
  classificationId: null,
  rowFieldKey: 'f_acc',
  classificationColumns: [],
  columns: [
    measure('f_bal', PeriodValue.CLOSING, 0),
    measure('f_mov', PeriodValue.ACCUMULATED, 0),
    measure('f_bal', PeriodValue.CLOSING, -1),
  ],
  profileId: null,
  scope: DataScope.all(),
  periodGrouping: PeriodGrouping.QUARTER,
  columnSplit: [OrgLevel.ORGANIZATION, OrgLevel.COMPANY],
  subtotals: true,
  onlyWhenFieldKey: null,
  includeUnclassified: true,
  ...overrides,
});

const run = (spec: ReportDefinitionRequest, period: string): ComputedReportResponse => {
  const definition: ReportDefinition = ReportDefinition.create(
    projectId,
    spec,
    catalog,
    new FixedClock(new Date(0)),
  ).unwrap();
  const engine: ReportEngine = new ReportEngine(
    definition,
    catalog,
    null,
    [classification],
    new ColumnSplit(definition.getSpec().columnSplit, org),
    TableWindows.of(definition, period).unwrap(),
    new Map<string, string>(),
  );
  for (const r of RECORDS) {
    engine.add(r);
  }
  return engine.result('id', period);
};

const detail = (report: ComputedReportResponse): ReportRowResponse => {
  const row: Nullable<ReportRowResponse> =
    report.rows.find((r: ReportRowResponse): boolean => !r.total) ?? null;
  if (row === null) {
    throw new Error('Sin filas');
  }
  return row;
};

describe('PeriodWindow', () => {
  it('toma el bloque del calendario hasta el mes del informe y el bloque anterior completo', (): void => {
    const quarter: PeriodWindow = PeriodWindow.of('2026-02', PeriodGrouping.QUARTER, 0).unwrap();
    expect(quarter.months()).toEqual(['2026-01', '2026-02']);
    const previous: PeriodWindow = PeriodWindow.of('2026-02', PeriodGrouping.QUARTER, -1).unwrap();
    expect(previous.months()).toEqual(['2025-10', '2025-11', '2025-12']);
    expect(PeriodWindow.of('2026-01', PeriodGrouping.MONTH, -1).unwrap().months()).toEqual(['2025-12']);
    expect(PeriodWindow.of('2026-08', PeriodGrouping.SEMESTER, 0).unwrap().label()).toBe('07/2026 – 08/2026');
    expect(PeriodWindow.of('2026-13', PeriodGrouping.MONTH, 0).isOk()).toBe(false);
  });

  it('elige el mes de cierre, el inicial o todos según cómo toma la columna los datos', (): void => {
    const window: PeriodWindow = PeriodWindow.of('2026-03', PeriodGrouping.QUARTER, 0).unwrap();
    expect(window.selects('2026-03', PeriodValue.CLOSING)).toBe(true);
    expect(window.selects('2026-02', PeriodValue.CLOSING)).toBe(false);
    expect(window.selects('2026-01', PeriodValue.OPENING)).toBe(true);
    expect(window.selects('2026-02', PeriodValue.ACCUMULATED)).toBe(true);
    expect(window.selects('2025-12', PeriodValue.ACCUMULATED)).toBe(false);
  });
});

describe('ReportEngine: tablas de datos', () => {
  it('abre columnas por organización y compañía con subtotales y período trimestral', (): void => {
    const report: ComputedReportResponse = run(request({}), '2026-03');
    expect(report.periodLabel).toBe('01/2026 – 03/2026');
    expect(report.attributeColumns.map((c) => c.label)).toEqual([
      'Número de cuenta',
      'Nombre de cuenta',
      'Balance',
    ]);
    expect(report.columns.map((c) => [...c.group, c.label].join(' / ')).slice(0, 3)).toEqual([
      'Grupo Demo / Compañía A / Saldo',
      'Grupo Demo / Compañía A / Mes',
      'Grupo Demo / Compañía A / Saldo (período anterior)',
    ]);
    expect(report.columns.filter((c) => c.subtotal).map((c) => c.group.join(' / '))).toEqual([
      'Total Grupo Demo / ',
      'Total Grupo Demo / ',
      'Total Grupo Demo / ',
      'Total consolidado / ',
      'Total consolidado / ',
      'Total consolidado / ',
    ]);
    const row: ReportRowResponse = detail(report);
    expect(row.attributes).toEqual(['1101', 'Caja', '1 Activo']);
    // A: saldo de marzo, suma de movimientos ene–mar, saldo de diciembre del año anterior.
    // B: igual; luego el subtotal de la organización y el consolidado.
    expect(row.values).toEqual(['160', '60', '100', '40', '5', '35', '200', '65', '135', '200', '65', '135']);
  });

  it('filtra por alcance y, sin abrir columnas, consolida en una sola columna por dato', (): void => {
    const onlyA: ComputedReportResponse = run(
      request({ scope: { ...DataScope.all(), companyIds: ['a'] }, columnSplit: [] }),
      '2026-03',
    );
    expect(detail(onlyA).values).toEqual(['160', '60', '100']);
    const all: ComputedReportResponse = run(request({ columnSplit: [] }), '2026-03');
    expect(detail(all).values).toEqual(['200', '65', '135']);
    expect(all.columns.map((c) => c.fieldKey)).toEqual(['f_bal', 'f_mov', 'f_bal@prev']);
  });

  it('en enero el período anterior mensual es diciembre del año anterior', (): void => {
    const january: ComputedReportResponse = run(
      request({ periodGrouping: PeriodGrouping.MONTH, columnSplit: [] }),
      '2026-01',
    );
    expect(detail(january).values).toEqual(['110', '10', '135']);
  });
});
