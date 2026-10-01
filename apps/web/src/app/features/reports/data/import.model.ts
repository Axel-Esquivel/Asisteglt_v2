import { CheckResultDto, ImportItemResponse, ImportItemStatus } from '@asisteglt/shared-contracts';
import { FieldDecoder, FieldReader } from '@asisteglt/shared-kernel';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { CHECK_RESULT } from './profile.model';
import { ReportsLabels } from './reports-labels';

export class ImportItemView {
  public constructor(public readonly s: ImportItemResponse) {}

  public static decoder(): FieldDecoder<ImportItemView> {
    return new FieldDecoder<ImportItemView>(
      (f: FieldReader): ImportItemView =>
        new ImportItemView({
          id: f.string('id'),
          batchId: f.string('batchId'),
          fileName: f.string('fileName'),
          size: f.number('size'),
          profileId: f.string('profileId'),
          profileName: f.string('profileName'),
          profileVersion: f.number('profileVersion'),
          period: f.string('period'),
          organizationId: f.string('organizationId'),
          countryId: f.string('countryId'),
          currency: f.string('currency'),
          companyId: f.string('companyId'),
          enterpriseId: f.nullableString('enterpriseId'),
          branchId: f.nullableString('branchId'),
          status: f.oneOf('status', Object.values(ImportItemStatus)),
          total: f.number('total'),
          data: f.number('data'),
          ignored: f.number('ignored'),
          rejected: f.number('rejected'),
          issues: f.list(
            'issues',
            new FieldDecoder((i: FieldReader) => ({
              line: i.number('line'),
              messages: i.stringList('messages'),
            })),
          ),
          checks: f.raw('checks') === null ? [] : f.list('checks', CHECK_RESULT),
          error: f.nullableString('error'),
          createdAt: f.string('createdAt'),
          finishedAt: f.nullableString('finishedAt'),
        }),
    );
  }

  public get id(): string {
    return this.s.id;
  }

  /** Validaciones de cuadre que no se cumplieron (las no bloqueantes publican con aviso). */
  public unbalanced(): number {
    return this.s.checks.filter((c: CheckResultDto): boolean => !c.passed).length;
  }

  public status(): {
    readonly label: string;
    readonly severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
  } {
    return ReportsLabels.importStatus(this.s.status);
  }

  public isRunning(): boolean {
    return this.s.status === ImportItemStatus.QUEUED || this.s.status === ImportItemStatus.PROCESSING;
  }
}

export class ImportBatchView {
  public constructor(
    public readonly id: string,
    public readonly createdAt: Date,
    public readonly items: ReadonlyArray<ImportItemView>,
  ) {}

  public static decoder(): FieldDecoder<ImportBatchView> {
    return new FieldDecoder<ImportBatchView>(
      (f: FieldReader): ImportBatchView =>
        new ImportBatchView(f.string('id'), f.date('createdAt'), f.list('items', ImportItemView.decoder())),
    );
  }

  public withItem(item: ImportItemView): ImportBatchView {
    return new ImportBatchView(
      this.id,
      this.createdAt,
      this.items.map((i: ImportItemView): ImportItemView => (i.id === item.id ? item : i)),
    );
  }
}

export class ImportItemEventView {
  public constructor(
    public readonly projectId: string,
    public readonly item: ImportItemView,
  ) {}

  public static decoder(): FieldDecoder<ImportItemEventView> {
    return new FieldDecoder<ImportItemEventView>(
      (f: FieldReader): ImportItemEventView =>
        new ImportItemEventView(f.string('projectId'), f.nested('item', ImportItemView.decoder())),
    );
  }
}

export class DataRow {
  public constructor(
    public readonly id: string,
    public readonly line: number,
    public readonly period: string,
    public readonly companyId: string,
    public readonly currency: string,
    private readonly values: ReadonlyMap<string, CellValue>,
  ) {}

  public value(key: string): CellValue {
    return this.values.get(key) ?? null;
  }

  public keys(): string[] {
    return [...this.values.keys()];
  }
}

export class RecordPage {
  public constructor(
    public readonly total: number,
    public readonly rows: DataRow[],
  ) {}

  public static decoder(): FieldDecoder<RecordPage> {
    const row: FieldDecoder<DataRow> = new FieldDecoder<DataRow>((f: FieldReader): DataRow => {
      const raw: unknown = f.raw('values');
      const values: Map<string, CellValue> = new Map<string, CellValue>();
      if (typeof raw === 'object' && raw !== null) {
        for (const [key, value] of Object.entries(raw)) {
          const cell: unknown = value;
          values.set(key, typeof cell === 'string' || typeof cell === 'boolean' ? cell : null);
        }
      }
      return new DataRow(
        f.string('id'),
        f.number('line'),
        f.string('period'),
        f.string('companyId'),
        f.string('currency'),
        values,
      );
    });
    return new FieldDecoder<RecordPage>(
      (f: FieldReader): RecordPage => new RecordPage(f.number('total'), f.list('rows', row)),
    );
  }
}
