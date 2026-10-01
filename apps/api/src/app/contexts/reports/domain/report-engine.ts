import {
  Aggregation,
  ClassificationNodeDto,
  ComputedReportResponse,
  ReportColumnResponse,
  ReportRowResponse,
  RowSource,
} from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { Decimal, Nullable } from '@asisteglt/shared-kernel';
import { Accumulator } from './accumulator';
import { Classification } from './classification';
import { CatalogField, FieldCatalog } from './field-catalog';
import { DataRecordSnapshot } from './ports';
import { ReportDefinition } from './report-definition';

class Measure {
  public constructor(
    public readonly key: string,
    public readonly label: string,
    public readonly aggregation: Aggregation,
    public readonly weightKey: Nullable<string>,
  ) {}
}

/** Grupo de filas con un acumulador por medida. */
class Bucket {
  public readonly accumulators: Accumulator[];

  public constructor(measures: ReadonlyArray<Measure>) {
    this.accumulators = measures.map((m: Measure): Accumulator => new Accumulator(m.aggregation));
  }

  public merge(other: Bucket): void {
    this.accumulators.forEach((a: Accumulator, i: number): void => {
      const source: Nullable<Accumulator> = other.accumulators[i] ?? null;
      if (source !== null) {
        a.merge(source);
      }
    });
  }

  public values(): Array<string | null> {
    return this.accumulators.map((a: Accumulator): string | null => a.result());
  }
}

/**
 * Calcula un informe matricial sobre los registros publicados: filas por clasificación (con
 * subtotales jerárquicos) o por un encabezado agrupable, y columnas con las medidas elegidas.
 */
export class ReportEngine {
  public static readonly UNCLASSIFIED: string = '__unclassified__';

  private readonly measures: Measure[];
  private readonly buckets: Map<string, Bucket> = new Map<string, Bucket>();
  private readonly total: Bucket;
  private records: number = 0;

  public constructor(
    private readonly definition: ReportDefinition,
    catalog: FieldCatalog,
    private readonly classification: Nullable<Classification>,
  ) {
    this.measures = definition.getSpec().measures.map((key: string): Measure => {
      const field: Nullable<CatalogField> = catalog.find(key).toNullable();
      const s = field === null ? null : field.snapshot();
      return new Measure(
        key,
        s === null ? key : s.label,
        s === null ? Aggregation.SUM : s.aggregation,
        s === null ? null : s.weightField,
      );
    });
    this.total = new Bucket(this.measures);
  }

  public add(record: DataRecordSnapshot): void {
    const spec = this.definition.getSpec();
    if (spec.onlyWhenFieldKey !== null && record.values[spec.onlyWhenFieldKey] !== true) {
      return;
    }
    const key: Nullable<string> = this.rowKey(record);
    if (key === null) {
      return;
    }
    this.records += 1;
    const bucket: Bucket = this.buckets.get(key) ?? new Bucket(this.measures);
    this.buckets.set(key, bucket);
    this.measures.forEach((m: Measure, i: number): void => {
      const value: Nullable<Decimal> = ReportEngine.decimal(record.values[m.key] ?? null);
      const weight: Nullable<Decimal> =
        m.weightKey === null ? null : ReportEngine.decimal(record.values[m.weightKey] ?? null);
      const accumulator: Nullable<Accumulator> = bucket.accumulators[i] ?? null;
      const totalAccumulator: Nullable<Accumulator> = this.total.accumulators[i] ?? null;
      if (accumulator !== null && totalAccumulator !== null) {
        accumulator.add(value, weight);
        totalAccumulator.add(value, weight);
      }
    });
  }

  public result(definitionId: string, period: string): ComputedReportResponse {
    const spec = this.definition.getSpec();
    const rows: ReportRowResponse[] =
      spec.rowSource === RowSource.CLASSIFICATION && this.classification !== null
        ? this.classificationRows(this.classification)
        : this.fieldRows();
    if (spec.includeUnclassified || spec.rowSource === RowSource.FIELD) {
      const unclassified: Nullable<Bucket> = this.buckets.get(ReportEngine.UNCLASSIFIED) ?? null;
      if (unclassified !== null && spec.rowSource === RowSource.CLASSIFICATION) {
        rows.push({
          key: ReportEngine.UNCLASSIFIED,
          label: 'Sin clasificar',
          level: 0,
          total: false,
          values: unclassified.values(),
        });
      }
    }
    rows.push({ key: '__total__', label: 'Total', level: 0, total: true, values: this.total.values() });
    return {
      definitionId,
      name: spec.name,
      period,
      records: this.records,
      columns: this.measures.map((m: Measure): ReportColumnResponse => ({ fieldKey: m.key, label: m.label })),
      rows,
    };
  }

  private rowKey(record: DataRecordSnapshot): Nullable<string> {
    const spec = this.definition.getSpec();
    if (spec.rowSource === RowSource.FIELD) {
      const value: CellValue = spec.rowFieldKey === null ? null : (record.values[spec.rowFieldKey] ?? null);
      return value === null ? '—' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value;
    }
    if (this.classification === null) {
      return null;
    }
    const value: CellValue = record.values[this.classification.getFieldKey()] ?? null;
    const node: Nullable<string> = typeof value === 'string' ? this.classification.classify(value) : null;
    if (node === null) {
      return spec.includeUnclassified ? ReportEngine.UNCLASSIFIED : null;
    }
    return node;
  }

  private fieldRows(): ReportRowResponse[] {
    return [...this.buckets.entries()]
      .sort((a: [string, Bucket], b: [string, Bucket]): number =>
        a[0].localeCompare(b[0], 'es', { numeric: true }),
      )
      .map(([key, bucket]: [string, Bucket]): ReportRowResponse => ({
        key,
        label: key,
        level: 0,
        total: false,
        values: bucket.values(),
      }));
  }

  /** Recorre el árbol: cada nodo muestra su subtotal (sus registros más los de sus descendientes). */
  private classificationRows(classification: Classification): ReportRowResponse[] {
    const rows: ReportRowResponse[] = [];
    const visit = (node: ClassificationNodeDto, level: number): Bucket => {
      const bucket: Bucket = new Bucket(this.measures);
      const own: Nullable<Bucket> = this.buckets.get(node.id) ?? null;
      if (own !== null) {
        bucket.merge(own);
      }
      const index: number = rows.length;
      const children: ClassificationNodeDto[] = classification.children(node.id);
      rows.push({ key: node.id, label: node.name, level, total: children.length > 0, values: [] });
      for (const child of children) {
        bucket.merge(visit(child, level + 1));
      }
      const label: string = node.code === '' ? node.name : `${node.code} ${node.name}`;
      rows[index] = { key: node.id, label, level, total: children.length > 0, values: bucket.values() };
      return bucket;
    };
    for (const root of classification.children(null)) {
      visit(root, 0);
    }
    return rows;
  }

  private static decimal(value: CellValue): Nullable<Decimal> {
    if (typeof value !== 'string') {
      return null;
    }
    return Decimal.of(value).match(
      (d: Decimal): Nullable<Decimal> => d,
      (): Nullable<Decimal> => null,
    );
  }
}
