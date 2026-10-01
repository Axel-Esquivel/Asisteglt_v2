import {
  Aggregation,
  ClassificationNodeDto,
  ComputedReportResponse,
  FormulaColumnDto,
  NumericNature,
  ReportColumnResponse,
  ReportRowResponse,
  RowSource,
} from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import {
  AggregateRequest,
  AggregateRequestCollector,
  EvaluationContext,
  Evaluator,
  Expression,
  FormulaContext,
  FormulaValue,
  Lexer,
  ListFieldResolver,
  Parser,
  RawValue,
  Token,
} from '@asisteglt/shared-formula-engine';
import { Decimal, Nullable, Result } from '@asisteglt/shared-kernel';
import { Accumulator } from './accumulator';
import { CatalogResolver } from './catalog-resolver';
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
    /** Montos y precios llevan moneda: no se combinan si vienen en monedas distintas. */
    public readonly currencySensitive: boolean,
  ) {}
}

/** Grupo de filas con un acumulador (y las monedas vistas) por medida. */
class Bucket {
  public readonly accumulators: Accumulator[];
  public readonly currencies: Array<Set<string>>;

  public constructor(measures: ReadonlyArray<Measure>) {
    this.accumulators = measures.map((m: Measure): Accumulator => new Accumulator(m.aggregation));
    this.currencies = measures.map((): Set<string> => new Set<string>());
  }

  public merge(other: Bucket): void {
    this.accumulators.forEach((a: Accumulator, i: number): void => {
      const source: Nullable<Accumulator> = other.accumulators[i] ?? null;
      if (source !== null) {
        a.merge(source);
      }
    });
    this.currencies.forEach((set: Set<string>, i: number): void => {
      for (const currency of other.currencies[i] ?? []) {
        set.add(currency);
      }
    });
  }

  public mixed(index: number): boolean {
    return (this.currencies[index] ?? new Set<string>()).size > 1;
  }

  /** Resultado de una medida, o vacío si mezcla monedas. */
  public result(index: number): Nullable<string> {
    const accumulator: Nullable<Accumulator> = this.accumulators[index] ?? null;
    return accumulator === null || this.mixed(index) ? null : accumulator.result();
  }
}

/** Contexto agregado de una fila del informe para las columnas calculadas. */
class BucketContext extends EvaluationContext {
  public constructor(
    private readonly bucket: Bucket,
    private readonly index: ReadonlyMap<string, number>,
  ) {
    super();
  }

  public override kind(): FormulaContext {
    return FormulaContext.AGGREGATE;
  }

  public override raw(_key: string): RawValue {
    return null;
  }

  public override aggregate(
    key: string,
    aggregation: Aggregation,
    weightKey: Nullable<string>,
  ): Nullable<Decimal> {
    const position: Nullable<number> =
      this.index.get(AggregateRequest.idOf(key, aggregation, weightKey)) ?? null;
    const text: Nullable<string> = position === null ? null : this.bucket.result(position);
    return text === null
      ? null
      : Decimal.of(text).match(
          (d: Decimal): Nullable<Decimal> => d,
          (): Nullable<Decimal> => null,
        );
  }
}

class FormulaColumn {
  public constructor(
    public readonly label: string,
    public readonly root: Nullable<Expression>,
  ) {}
}

/**
 * Calcula un informe matricial sobre los registros publicados: filas por clasificación (con
 * subtotales jerárquicos) o por un encabezado agrupable, columnas con las medidas elegidas y
 * columnas calculadas con fórmulas agregadas. Nunca suma montos de monedas distintas.
 */
export class ReportEngine {
  public static readonly UNCLASSIFIED: string = '__unclassified__';

  /** Medidas visibles primero; después las que solo piden las columnas calculadas. */
  private readonly measures: Measure[] = [];
  private readonly visible: number;
  private readonly index: Map<string, number> = new Map<string, number>();
  private readonly formulas: FormulaColumn[];
  private readonly resolver: ListFieldResolver;
  private readonly buckets: Map<string, Bucket> = new Map<string, Bucket>();
  private readonly total: Bucket;
  private records: number = 0;

  public constructor(
    private readonly definition: ReportDefinition,
    private readonly catalog: FieldCatalog,
    private readonly classification: Nullable<Classification>,
    private readonly convertedCurrencies: ReadonlyMap<string, string>,
  ) {
    this.resolver = CatalogResolver.of(catalog);
    for (const key of definition.getSpec().measures) {
      const field: Nullable<CatalogField> = catalog.find(key).toNullable();
      const s = field === null ? null : field.snapshot();
      this.measure(
        key,
        s === null ? Aggregation.SUM : s.aggregation,
        s === null ? null : s.weightField,
        true,
      );
    }
    this.visible = this.measures.length;
    this.formulas = definition.getSpec().formulaColumns.map((c: FormulaColumnDto): FormulaColumn => {
      const root: Nullable<Expression> = new Lexer()
        .tokenize(c.formula)
        .flatMap((tokens: Token[]): Result<Expression> => new Parser(this.resolver).parse(tokens))
        .match(
          (e: Expression): Nullable<Expression> => e,
          (): Nullable<Expression> => null,
        );
      if (root !== null) {
        for (const request of new AggregateRequestCollector(this.resolver).collect(root)) {
          this.measure(request.key, request.aggregation, request.weightKey, false);
        }
      }
      return new FormulaColumn(c.label, root);
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
      for (const target of [bucket, this.total]) {
        const accumulator: Nullable<Accumulator> = target.accumulators[i] ?? null;
        if (accumulator !== null) {
          accumulator.add(value, weight);
        }
        if (value !== null && m.currencySensitive) {
          (target.currencies[i] ?? new Set<string>()).add(
            this.convertedCurrencies.get(m.key) ?? record.currency,
          );
        }
      }
    });
  }

  public result(definitionId: string, period: string): ComputedReportResponse {
    const spec = this.definition.getSpec();
    const rows: ReportRowResponse[] =
      spec.rowSource === RowSource.CLASSIFICATION && this.classification !== null
        ? this.classificationRows(this.classification)
        : this.fieldRows();
    const unclassified: Nullable<Bucket> = this.buckets.get(ReportEngine.UNCLASSIFIED) ?? null;
    if (spec.includeUnclassified && unclassified !== null && spec.rowSource === RowSource.CLASSIFICATION) {
      rows.push({
        key: ReportEngine.UNCLASSIFIED,
        label: 'Sin clasificar',
        level: 0,
        total: false,
        values: this.values(unclassified),
      });
    }
    rows.push({ key: '__total__', label: 'Total', level: 0, total: true, values: this.values(this.total) });
    return {
      definitionId,
      name: spec.name,
      period,
      records: this.records,
      columns: [
        ...this.measures
          .slice(0, this.visible)
          .map((m: Measure): ReportColumnResponse => ({ fieldKey: m.key, label: m.label })),
        ...this.formulas.map((f: FormulaColumn, i: number): ReportColumnResponse => ({
          fieldKey: `formula:${String(i + 1)}`,
          label: f.label,
        })),
      ],
      rows,
      warnings: this.warnings(),
    };
  }

  private measure(
    key: string,
    aggregation: Aggregation,
    weightKey: Nullable<string>,
    visible: boolean,
  ): void {
    const id: string = AggregateRequest.idOf(key, aggregation, weightKey);
    if (!visible && this.index.has(id)) {
      return;
    }
    const field: Nullable<CatalogField> = this.catalog.find(key).toNullable();
    const nature: Nullable<NumericNature> = field === null ? null : field.snapshot().nature;
    const sensitive: boolean = nature === NumericNature.AMOUNT || nature === NumericNature.UNIT_PRICE;
    this.index.set(id, this.measures.length);
    this.measures.push(
      new Measure(key, field === null ? key : field.label, aggregation, weightKey, sensitive),
    );
  }

  private values(bucket: Bucket): Array<string | null> {
    const context: BucketContext = new BucketContext(bucket, this.index);
    return [
      ...this.measures
        .slice(0, this.visible)
        .map((_m: Measure, i: number): Nullable<string> => bucket.result(i)),
      ...this.formulas.map((f: FormulaColumn): Nullable<string> =>
        f.root === null ? null : ReportEngine.cell(new Evaluator(this.resolver, context).evaluate(f.root)),
      ),
    ];
  }

  private warnings(): string[] {
    const reported: Set<string> = new Set<string>();
    const warnings: string[] = [];
    this.measures.forEach((m: Measure, i: number): void => {
      if (this.total.mixed(i) && !reported.has(m.key)) {
        reported.add(m.key);
        const currencies: string = [...(this.total.currencies[i] ?? [])].sort().join(', ');
        warnings.push(
          `«${m.label}» tiene montos en varias monedas (${currencies}); no se suman entre sí. Conviértelos con una operación de conversión de moneda o filtra por compañía.`,
        );
      }
    });
    return warnings;
  }

  private static cell(value: FormulaValue): Nullable<string> {
    if (value instanceof Decimal) {
      return value.toString();
    }
    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }
    return value;
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
        values: this.values(bucket),
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
      rows[index] = { key: node.id, label, level, total: children.length > 0, values: this.values(bucket) };
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
