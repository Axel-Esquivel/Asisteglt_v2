import {
  Aggregation,
  ComputedReportResponse,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
  OrgLevel,
  PeriodGrouping,
  PeriodValue,
  PivotDimensionDto,
  PivotDto,
  PivotSource,
  PivotValueDto,
  PivotValueKind,
  ReportRowResponse,
  ValueFilterDto,
} from '@asisteglt/shared-contracts';
import { EntityId, Nullable } from '@asisteglt/shared-kernel';
import { Classification } from './classification';
import { DataScope } from './data-scope';
import { CatalogFieldSnapshot, FieldCatalog } from './field-catalog';
import { OrgStructure } from './org-structure';
import { PivotEngine } from './pivot-engine';
import { DataRecordSnapshot } from './ports';
import { RecordFilter } from './record-filter';

/** Datos FICTICIOS: dos compañías con cuentas de activo y pasivo en dos meses. */
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
    field('f_acc', 'Cuenta', FieldRole.IDENTIFIER, DataType.TEXT, null, null),
    field('f_name', 'Nombre', FieldRole.IDENTIFIER_NAME, DataType.TEXT, null, 'f_acc'),
    field('f_bal', 'Saldo', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null),
  ],
});

const org: OrgStructure = OrgStructure.restore({
  id: EntityId.generate().toString(),
  projectId: projectId.toString(),
  units: [
    { id: 'org', level: OrgLevel.ORGANIZATION, parentId: null, code: 'G', name: 'Grupo Demo', currencies: [] },
    { id: 'p1', level: OrgLevel.COUNTRY, parentId: 'org', code: 'P1', name: 'País Uno', currencies: ['AAA'] },
    { id: 'a', level: OrgLevel.COMPANY, parentId: 'p1', code: 'A', name: 'Compañía A', currencies: [] },
    { id: 'b', level: OrgLevel.COMPANY, parentId: 'p1', code: 'B', name: 'Compañía B', currencies: [] },
  ],
});

const CLS: string = EntityId.generate().toString();

const classification: Classification = Classification.restore({
  id: CLS,
  projectId: projectId.toString(),
  name: 'Balance',
  fieldKey: 'f_acc',
  nodes: [
    { id: 'n1', parentId: null, code: '1', name: 'Activo', patterns: [] },
    { id: 'n11', parentId: 'n1', code: '11', name: 'Circulante', patterns: ['11*'] },
    { id: 'n12', parentId: 'n1', code: '12', name: 'Fijo', patterns: ['12*'] },
    { id: 'n2', parentId: null, code: '2', name: 'Pasivo', patterns: ['2*'] },
  ],
  updatedAt: new Date(0),
});

let line: number = 0;
const record = (
  period: string,
  companyId: string,
  account: string,
  balance: string,
  currency: string,
): DataRecordSnapshot => {
  line += 1;
  return {
    id: `r${String(line)}`,
    projectId: projectId.toString(),
    loadId: `load-${companyId}-${period}`,
    profileId: 'p',
    period,
    organizationId: 'org',
    countryId: 'p1',
    currency,
    companyId,
    enterpriseId: null,
    branchId: null,
    line,
    values: { f_acc: account, f_name: `Cuenta ${account}`, f_bal: balance },
  };
};

const RECORDS: DataRecordSnapshot[] = [
  record('2026-02', 'a', '1101', '100', 'AAA'),
  record('2026-02', 'a', '1201', '400', 'AAA'),
  record('2026-02', 'b', '1101', '50', 'AAA'),
  record('2026-02', 'a', '2101', '300', 'AAA'),
  record('2026-03', 'a', '1101', '120', 'AAA'),
  record('2026-03', 'a', '1201', '380', 'AAA'),
  record('2026-03', 'b', '1101', '80', 'AAA'),
  record('2026-03', 'a', '2101', '310', 'AAA'),
];

const filterOf = (nodeIds: string[]): ValueFilterDto => ({
  classificationId: CLS,
  nodeIds,
  scope: DataScope.all(),
  periodGrouping: PeriodGrouping.MONTH,
  periodValue: PeriodValue.CLOSING,
  periodOffset: 0,
  presentation: null,
});

const classificationLevel = (level: number): PivotDimensionDto => ({
  source: PivotSource.CLASSIFICATION,
  key: CLS,
  level,
});

const saldo = (periodOffset: number, label: string): PivotValueDto => ({
  kind: PivotValueKind.FIELD,
  fieldKey: 'f_bal',
  label,
  periodOffset,
  left: 0,
  right: 0,
});

const derived = (kind: PivotValueKind, left: number, right: number, label: string): PivotValueDto => ({
  kind,
  fieldKey: null,
  label,
  periodOffset: 0,
  left,
  right,
});

const run = (
  spec: PivotDto,
  filter: ValueFilterDto,
  records: ReadonlyArray<DataRecordSnapshot>,
): ComputedReportResponse => {
  const built: RecordFilter = RecordFilter.of(
    filter,
    filter.scope,
    classification,
    '2026-03',
    PivotEngine.offsets(spec),
  ).unwrap();
  const engine: PivotEngine = new PivotEngine(
    spec,
    catalog,
    new Map<string, Classification>([[CLS, classification]]),
    org,
    new Map<string, string>(),
    null,
  );
  for (const r of records) {
    if (built.admits(r)) {
      engine.add(r, built);
    }
  }
  return engine.result('pv', 'Activos', '2026-03', built.label());
};

const byLabel = (result: ComputedReportResponse, label: string): ReportRowResponse => {
  const row: Nullable<ReportRowResponse> =
    result.rows.find((r: ReportRowResponse): boolean => r.label === label) ?? null;
  if (row === null) {
    throw new Error(`Falta la fila ${label}`);
  }
  return row;
};

describe('PivotEngine', () => {
  const balance: PivotDto = {
    rows: [classificationLevel(1), classificationLevel(2)],
    columns: [],
    values: [
      saldo(0, 'Mes actual'),
      saldo(-1, 'Mes anterior'),
      derived(PivotValueKind.DIFFERENCE, 0, 1, 'Variación'),
      derived(PivotValueKind.RATIO, 2, 0, 'Var %'),
    ],
    subtotals: true,
    rowTitle: 'ACTIVOS',
    totalLabel: 'TOTAL ACTIVOS',
  };

  it('arma un bloque de balance: grupo › rubro, mes actual, anterior, variación y %', () => {
    const result: ComputedReportResponse = run(balance, filterOf(['n1']), RECORDS);
    expect(result.attributeColumns.map((c) => c.label)).toEqual(['ACTIVOS']);
    expect(result.columns.map((c) => c.label)).toEqual(['Mes actual', 'Mes anterior', 'Variación', 'Var %']);
    expect(result.rows.map((r: ReportRowResponse): string => r.label)).toEqual([
      '1 Activo',
      '11 Circulante',
      '12 Fijo',
      'TOTAL ACTIVOS',
    ]);
    const group: ReportRowResponse = byLabel(result, '1 Activo');
    expect(group.total).toBe(true);
    expect(group.values).toEqual(['580', '550', '30', '5.17241379310344827586206896551724137931']);
    expect(byLabel(result, '11 Circulante').values.slice(0, 3)).toEqual(['200', '150', '50']);
    expect(byLabel(result, '12 Fijo').values.slice(0, 3)).toEqual(['380', '400', '-20']);
    // El pasivo no entra: el filtro solo deja el nodo Activo y sus descendientes.
    expect(byLabel(result, 'TOTAL ACTIVOS').values.slice(0, 2)).toEqual(['580', '550']);
  });

  it('abre columnas por compañía con su total y muestra las cuentas con su nombre', () => {
    const result: ComputedReportResponse = run(
      {
        rows: [{ source: PivotSource.FIELD, key: 'f_acc', level: 0 }],
        columns: [{ source: PivotSource.ORG, key: OrgLevel.COMPANY, level: 0 }],
        values: [saldo(0, '')],
        subtotals: true,
        rowTitle: '',
        totalLabel: '',
      },
      filterOf([]),
      RECORDS,
    );
    expect(result.columns.map((c) => c.group[0])).toEqual(['Compañía A', 'Compañía B', 'Total']);
    expect(result.columns.map((c) => c.label)).toEqual(['Saldo', 'Saldo', 'Saldo']);
    expect(byLabel(result, '1101 Cuenta 1101').values).toEqual(['120', '80', '200']);
    expect(byLabel(result, 'Total').values).toEqual(['810', '80', '890']);
  });

  it('no suma montos de monedas distintas y lo avisa', () => {
    const result: ComputedReportResponse = run(
      {
        rows: [classificationLevel(1)],
        columns: [],
        values: [saldo(0, '')],
        subtotals: true,
        rowTitle: '',
        totalLabel: '',
      },
      filterOf(['n1']),
      [...RECORDS, record('2026-03', 'b', '1201', '10', 'BBB')],
    );
    expect(byLabel(result, 'Total').values).toEqual([null]);
    expect(result.warnings.join(' ')).toContain('varias monedas (AAA, BBB)');
  });
});

describe('RecordFilter', () => {
  it('incluye los descendientes de los nodos elegidos', () => {
    expect([...RecordFilter.withDescendants(classification, ['n1'])].sort()).toEqual(['n1', 'n11', 'n12']);
  });

  it('filtra por nodo, alcance y período', () => {
    const filter: RecordFilter = RecordFilter.of(
      { ...filterOf(['n11']), scope: { ...DataScope.all(), companyIds: ['a'] } },
      { ...DataScope.all(), companyIds: ['a'] },
      classification,
      '2026-03',
      [],
    ).unwrap();
    const matching: DataRecordSnapshot[] = RECORDS.filter((r: DataRecordSnapshot): boolean => filter.matches(r));
    expect(matching.map((r: DataRecordSnapshot): string => `${r.period}|${r.companyId}|${String(r.values['f_acc'])}`)).toEqual([
      '2026-03|a|1101',
    ]);
  });
});
