import {
  Aggregation,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
  OperationKind,
} from '@asisteglt/shared-contracts';
import { EntityId, Nullable } from '@asisteglt/shared-kernel';
import { CatalogResolver } from './catalog-resolver';
import { CollectionRates } from './collection-rates';
import { CatalogFieldSnapshot, FieldCatalog } from './field-catalog';
import { HistorySource, OperationRunner } from './operation-runner';
import { DataRecordSnapshot } from './ports';

/** Datos FICTICIOS: una cuenta con movimientos en dos sucursales de la misma compañía. */
const field = (
  key: string,
  role: FieldRole,
  dataType: DataType,
  nature: Nullable<NumericNature>,
): CatalogFieldSnapshot => ({
  key,
  label: key,
  origin: role === FieldRole.DATA && key === 'f_ytd' ? FieldOrigin.DERIVED : FieldOrigin.IMPORTED,
  role,
  dataType,
  nature,
  aggregation: nature === null ? Aggregation.NONE : Aggregation.SUM,
  describes: null,
  weightField: null,
  active: true,
});

const catalog: FieldCatalog = FieldCatalog.restore({
  id: EntityId.generate().toString(),
  projectId: EntityId.generate().toString(),
  version: 1,
  fields: [
    field('f_acc', FieldRole.IDENTIFIER, DataType.TEXT, null),
    field('f_mov', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT),
    field('f_ytd', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT),
  ],
});

const record = (period: string, branchId: string, movement: string): DataRecordSnapshot => ({
  id: `${branchId}-${period}`,
  projectId: 'p',
  loadId: `${branchId}-${period}`,
  profileId: 'profile',
  period,
  organizationId: 'org',
  countryId: 'gt',
  currency: 'GTQ',
  companyId: 'a',
  enterpriseId: 'e',
  branchId,
  line: 1,
  values: { f_acc: '4101', f_mov: movement },
});

class ArrayHistory extends HistorySource {
  public constructor(private readonly records: ReadonlyArray<DataRecordSnapshot>) {
    super();
  }

  public override async *between(periodFrom: string, periodTo: string): AsyncIterable<DataRecordSnapshot> {
    for (const r of this.records) {
      if (r.period >= periodFrom && r.period <= periodTo) {
        yield await Promise.resolve(r);
      }
    }
  }
}

describe('OperationRunner: acumulado del año', () => {
  it('acumula cada sucursal por separado', async (): Promise<void> => {
    const records: DataRecordSnapshot[] = [
      record('2026-01', 'north', '10'),
      record('2026-02', 'north', '20'),
      record('2026-01', 'south', '100'),
      record('2026-02', 'south', '200'),
    ];
    const runner: OperationRunner = new OperationRunner(
      [
        {
          id: 's1',
          kind: OperationKind.YEAR_TO_DATE,
          targetKey: 'f_ytd',
          formula: null,
          sourceKey: 'f_mov',
          collectionId: null,
          rateFieldKey: null,
          currencyFieldKey: null,
          quote: null,
          targetCurrency: null,
        },
      ],
      catalog,
      CatalogResolver.of(catalog),
      new CollectionRates([]),
    );
    await runner.prepare(['2026-02'], new ArrayHistory(records));
    expect(runner.apply(record('2026-02', 'north', '20')).values['f_ytd']).toBe('30');
    expect(runner.apply(record('2026-02', 'south', '200')).values['f_ytd']).toBe('300');
  });
});
