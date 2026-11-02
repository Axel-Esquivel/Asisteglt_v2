import {
  Aggregation,
  ClassificationNodeDto,
  ComputedReportResponse,
  DataColumnDto,
  DataColumnKind,
  NumericNature,
  PeriodValue,
  ReportAttributeColumnResponse,
  ReportColumnResponse,
  ReportDefinitionRequest,
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
import { ColumnGroup, ColumnSplit, DataScope } from './data-scope';
import { CatalogField, FieldCatalog } from './field-catalog';
import { PeriodWindow } from './period-window';
import { DataRecordSnapshot } from './ports';
import { ReportDefinition } from './report-definition';

/** Un encabezado agregado en un período (el del informe o el anterior) según cómo toma los meses. */
class Measure {
  public constructor(
    public readonly key: string,
    public readonly label: string,
    public readonly aggregation: Aggregation,
    public readonly weightKey: Nullable<string>,
    /** Montos y precios llevan moneda: no se combinan si vienen en monedas distintas. */
    public readonly currencySensitive: boolean,
    public readonly window: PeriodWindow,
    public readonly periodValue: PeriodValue,
  ) {}

  public selects(period: string): boolean {
    return this.window.selects(period, this.periodValue);
  }
}

/** Celda agregada (fila × grupo de columnas) con un acumulador y las monedas vistas por medida. */
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

/** Contexto agregado de una celda para una columna calculada. */
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

/** Columna de valores en el orden elegido: una medida o una fórmula sobre sus propias medidas. */
class ValueColumn {
  public constructor(
    public readonly key: string,
    public readonly label: string,
    /** Posición de la medida (columnas de medida). */
    public readonly measure: Nullable<number>,
    /** Fórmula y sus medidas por identificador de agregación (columnas calculadas). */
    public readonly root: Nullable<Expression>,
    public readonly index: ReadonlyMap<string, number>,
  ) {}
}

/** Grupo de columnas de la respuesta: una hoja, un subtotal o el total consolidado. */
class OutputGroup {
  public constructor(
    public readonly key: string,
    public readonly labels: ReadonlyArray<string>,
    public readonly subtotal: boolean,
    public readonly members: ReadonlyArray<string>,
  ) {}
}

/** Datos de una fila de detalle: sus textos y sus celdas por grupo de columnas. */
class RowData {
  public readonly cells: Map<string, Bucket> = new Map<string, Bucket>();
  public readonly attributes: Array<Nullable<string>>;

  public constructor(size: number) {
    this.attributes = Array.from({ length: size }, (): Nullable<string> => null);
  }
}

/** Ventanas de período que usa una tabla: la del informe (0) y, si se pide, la anterior (-1). */
export class TableWindows {
  public constructor(private readonly byOffset: ReadonlyMap<number, PeriodWindow>) {}

  public static of(definition: ReportDefinition, period: string): Result<TableWindows> {
    const spec: ReportDefinitionRequest = definition.getSpec();
    const offsets: Set<number> = new Set<number>([0]);
    for (const column of spec.columns) {
      offsets.add(column.periodOffset);
    }
    const windows: Map<number, PeriodWindow> = new Map<number, PeriodWindow>();
    for (const offset of offsets) {
      const window: Result<PeriodWindow> = PeriodWindow.of(period, spec.periodGrouping, offset);
      const error = window.errorOrNull();
      if (error !== null) {
        return Result.fail(error);
      }
      windows.set(offset, window.unwrap());
    }
    return Result.ok(new TableWindows(windows));
  }

  public at(offset: number): PeriodWindow {
    const found: Nullable<PeriodWindow> = this.byOffset.get(offset) ?? null;
    if (found === null) {
      throw new Error(`Ventana de período no preparada (${String(offset)})`);
    }
    return found;
  }

  /** Todos los meses que hay que leer, en orden. */
  public months(): string[] {
    const months: Set<string> = new Set<string>();
    for (const window of this.byOffset.values()) {
      for (const month of window.months()) {
        months.add(month);
      }
    }
    return [...months].sort();
  }

  public current(): PeriodWindow {
    return this.at(0);
  }
}

/**
 * Calcula una tabla de datos sobre los registros publicados: filas por clasificación (con
 * subtotales jerárquicos) o por un encabezado agrupable (con su nombre y columnas de
 * clasificación), columnas en el orden elegido, abiertas opcionalmente por niveles de la
 * estructura con subtotales y total consolidado. Nunca suma montos de monedas distintas.
 */
export class ReportEngine {
  public static readonly UNCLASSIFIED: string = '__unclassified__';
  /** Máximo de grupos de columnas (p. ej. compañías) que se muestran. */
  public static readonly MAX_GROUPS: number = 60;

  private readonly measures: Measure[] = [];
  private readonly columns: ValueColumn[] = [];
  private readonly resolver: ListFieldResolver;
  private readonly rows: Map<string, RowData> = new Map<string, RowData>();
  private readonly totals: Map<string, Bucket> = new Map<string, Bucket>();
  private readonly groups: Map<string, ColumnGroup> = new Map<string, ColumnGroup>();
  private readonly scope: DataScope;
  private readonly attributeColumns: ReportAttributeColumnResponse[];
  private readonly nameFieldKey: Nullable<string>;
  private records: number = 0;
  /** Valores del encabezado clasificado que ningún nodo captura (p. ej. cuentas nuevas). */
  private readonly unclassified: Set<string> = new Set<string>();

  public constructor(
    private readonly definition: ReportDefinition,
    private readonly catalog: FieldCatalog,
    private readonly classification: Nullable<Classification>,
    private readonly classificationColumns: ReadonlyArray<Classification>,
    private readonly split: ColumnSplit,
    private readonly windows: TableWindows,
    private readonly convertedCurrencies: ReadonlyMap<string, string>,
  ) {
    const spec: ReportDefinitionRequest = definition.getSpec();
    this.resolver = CatalogResolver.of(catalog);
    this.scope = DataScope.of(spec.scope);
    this.nameFieldKey =
      spec.rowSource === RowSource.FIELD && spec.rowFieldKey !== null
        ? catalog.nameFieldOf(spec.rowFieldKey)
        : null;
    this.attributeColumns = this.buildAttributeColumns(spec);
    const used: Set<string> = new Set<string>();
    spec.columns.forEach((column: DataColumnDto, position: number): void => {
      const window: PeriodWindow = windows.at(column.periodOffset);
      const base: string =
        column.kind === DataColumnKind.MEASURE
          ? `${column.fieldKey ?? ''}${column.periodOffset === 0 ? '' : '@prev'}`
          : `formula:${String(position + 1)}`;
      const key: string = used.has(base) ? `${base}#${String(position + 1)}` : base;
      used.add(key);
      this.columns.push(
        column.kind === DataColumnKind.MEASURE
          ? this.measureColumn(key, column, window)
          : this.formulaColumn(key, column, window),
      );
    });
  }

  public add(record: DataRecordSnapshot): void {
    const spec: ReportDefinitionRequest = this.definition.getSpec();
    if (!this.scope.matches(record)) {
      return;
    }
    if (spec.onlyWhenFieldKey !== null && record.values[spec.onlyWhenFieldKey] !== true) {
      return;
    }
    if (!this.measures.some((m: Measure): boolean => m.selects(record.period))) {
      return;
    }
    const key: Nullable<string> = this.rowKey(record);
    if (key === null) {
      return;
    }
    this.records += 1;
    const group: ColumnGroup = this.split.groupOf(record);
    const groupKey: string = group.key();
    if (!this.groups.has(groupKey)) {
      this.groups.set(groupKey, group);
    }
    const row: RowData = this.rows.get(key) ?? new RowData(this.attributeColumns.length);
    this.rows.set(key, row);
    this.fillAttributes(row, key, record);
    const cell: Bucket = row.cells.get(groupKey) ?? new Bucket(this.measures);
    row.cells.set(groupKey, cell);
    const total: Bucket = this.totals.get(groupKey) ?? new Bucket(this.measures);
    this.totals.set(groupKey, total);
    this.measures.forEach((m: Measure, i: number): void => {
      if (!m.selects(record.period)) {
        return;
      }
      const value: Nullable<Decimal> = ReportEngine.decimal(record.values[m.key] ?? null);
      const weight: Nullable<Decimal> =
        m.weightKey === null ? null : ReportEngine.decimal(record.values[m.weightKey] ?? null);
      for (const target of [cell, total]) {
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
    const spec: ReportDefinitionRequest = this.definition.getSpec();
    const groups: OutputGroup[] = this.outputGroups();
    const rows: ReportRowResponse[] =
      spec.rowSource === RowSource.CLASSIFICATION && this.classification !== null
        ? this.classificationRows(this.classification, groups)
        : this.fieldRows(groups);
    const unclassified: Nullable<RowData> = this.rows.get(ReportEngine.UNCLASSIFIED) ?? null;
    if (spec.includeUnclassified && unclassified !== null && spec.rowSource === RowSource.CLASSIFICATION) {
      rows.push(this.row(ReportEngine.UNCLASSIFIED, 'Sin clasificar', 0, false, unclassified.cells, groups));
    }
    rows.push(this.row('__total__', 'Total', 0, true, this.totals, groups));
    return {
      definitionId,
      name: spec.name,
      period,
      periodLabel: this.windows.current().label(),
      records: this.records,
      attributeColumns: this.attributeColumns,
      columns: groups.flatMap((g: OutputGroup): ReportColumnResponse[] =>
        this.columns.map((c: ValueColumn): ReportColumnResponse => ({
          fieldKey: g.key === '' ? c.key : `${g.key}|${c.key}`,
          label: c.label,
          group: g.labels,
          subtotal: g.subtotal,
        })),
      ),
      rows,
      warnings: this.warnings(groups),
    };
  }

  private buildAttributeColumns(spec: ReportDefinitionRequest): ReportAttributeColumnResponse[] {
    if (spec.rowSource === RowSource.CLASSIFICATION) {
      return [{ key: 'row', label: this.classification === null ? 'Fila' : this.classification.getName() }];
    }
    const label = (key: Nullable<string>): string =>
      key === null
        ? ''
        : this.catalog
            .find(key)
            .map((f: CatalogField): string => f.label)
            .orElse(key);
    const columns: ReportAttributeColumnResponse[] = [{ key: 'row', label: label(spec.rowFieldKey) }];
    if (this.nameFieldKey !== null) {
      columns.push({ key: 'name', label: label(this.nameFieldKey) });
    }
    for (const c of this.classificationColumns) {
      columns.push({ key: `classification:${c.getId().toString()}`, label: c.getName() });
    }
    return columns;
  }

  private measureColumn(key: string, column: DataColumnDto, window: PeriodWindow): ValueColumn {
    const fieldKey: string = column.fieldKey ?? '';
    const field: Nullable<CatalogField> = this.catalog.find(fieldKey).toNullable();
    const s = field === null ? null : field.snapshot();
    const position: number = this.addMeasure(
      fieldKey,
      s === null ? Aggregation.SUM : s.aggregation,
      s === null ? null : s.weightField,
      window,
      column.periodValue,
    );
    const name: string = field === null ? fieldKey : field.label;
    const label: string =
      column.label !== '' ? column.label : column.periodOffset === 0 ? name : `${name} (período anterior)`;
    return new ValueColumn(key, label, position, null, new Map<string, number>());
  }

  private formulaColumn(key: string, column: DataColumnDto, window: PeriodWindow): ValueColumn {
    const root: Nullable<Expression> = new Lexer()
      .tokenize(column.formula ?? '')
      .flatMap((tokens: Token[]): Result<Expression> => new Parser(this.resolver).parse(tokens))
      .match(
        (e: Expression): Nullable<Expression> => e,
        (): Nullable<Expression> => null,
      );
    const index: Map<string, number> = new Map<string, number>();
    if (root !== null) {
      for (const request of new AggregateRequestCollector(this.resolver).collect(root)) {
        if (!index.has(request.id())) {
          index.set(
            request.id(),
            this.addMeasure(request.key, request.aggregation, request.weightKey, window, column.periodValue),
          );
        }
      }
    }
    return new ValueColumn(key, column.label, null, root, index);
  }

  private addMeasure(
    key: string,
    aggregation: Aggregation,
    weightKey: Nullable<string>,
    window: PeriodWindow,
    periodValue: PeriodValue,
  ): number {
    const field: Nullable<CatalogField> = this.catalog.find(key).toNullable();
    const nature: Nullable<NumericNature> = field === null ? null : field.snapshot().nature;
    const sensitive: boolean = nature === NumericNature.AMOUNT || nature === NumericNature.UNIT_PRICE;
    this.measures.push(
      new Measure(
        key,
        field === null ? key : field.label,
        aggregation,
        weightKey,
        sensitive,
        window,
        periodValue,
      ),
    );
    return this.measures.length - 1;
  }

  /** Hojas ordenadas como la estructura; con subtotales, uno por nivel y el total consolidado. */
  private outputGroups(): OutputGroup[] {
    const depth: number = this.split.depth();
    if (depth === 0) {
      return [new OutputGroup('', [], false, [...this.groups.keys()])];
    }
    const leaves: ColumnGroup[] = this.split
      .sort([...this.groups.values()])
      .slice(0, ReportEngine.MAX_GROUPS);
    const result: OutputGroup[] = [];
    const subtotals: boolean = this.definition.getSpec().subtotals;
    const pad = (labels: string[]): string[] => [
      ...labels,
      ...Array.from({ length: depth - labels.length }, (): string => ''),
    ];
    leaves.forEach((leaf: ColumnGroup, i: number): void => {
      result.push(new OutputGroup(leaf.key(), leaf.labels, false, [leaf.key()]));
      if (!subtotals) {
        return;
      }
      const next: Nullable<ColumnGroup> = leaves[i + 1] ?? null;
      for (let level: number = depth - 1; level >= 1; level -= 1) {
        const prefix: string = ColumnGroup.keyOf(leaf.ids.slice(0, level));
        const nextPrefix: Nullable<string> =
          next === null ? null : ColumnGroup.keyOf(next.ids.slice(0, level));
        if (prefix === nextPrefix) {
          break;
        }
        const members: string[] = leaves
          .filter((g: ColumnGroup): boolean => ColumnGroup.keyOf(g.ids.slice(0, level)) === prefix)
          .map((g: ColumnGroup): string => g.key());
        // Sin unidad en este nivel (p. ej. compañía sin empresas), o un único grupo sin niveles
        // más abajo: el subtotal repetiría la columna, así que no se agrega.
        const missing: boolean = (leaf.ids[level - 1] ?? null) === null;
        const repeated: boolean =
          members.length === 1 && leaf.ids.slice(level).every((id: Nullable<string>): boolean => id === null);
        if (missing || repeated) {
          continue;
        }
        const labels: string[] = leaf.labels.slice(0, level);
        result.push(
          new OutputGroup(
            `total:${prefix}`,
            pad([...labels.slice(0, -1), `Total ${labels.at(-1) ?? ''}`]),
            true,
            members,
          ),
        );
      }
    });
    if (subtotals) {
      result.push(
        new OutputGroup(
          'total',
          pad(['Total consolidado']),
          true,
          leaves.map((g: ColumnGroup): string => g.key()),
        ),
      );
    }
    return result;
  }

  private row(
    key: string,
    label: string,
    level: number,
    total: boolean,
    cells: ReadonlyMap<string, Bucket>,
    groups: ReadonlyArray<OutputGroup>,
  ): ReportRowResponse {
    const data: Nullable<RowData> = this.rows.get(key) ?? null;
    const attributes: Array<Nullable<string>> =
      data === null ? this.attributeColumns.map((): Nullable<string> => null) : [...data.attributes];
    attributes[0] = label;
    return {
      key,
      label,
      level,
      total,
      attributes,
      values: groups.flatMap((g: OutputGroup): Array<Nullable<string>> => this.values(this.merge(cells, g))),
    };
  }

  private merge(cells: ReadonlyMap<string, Bucket>, group: OutputGroup): Bucket {
    const bucket: Bucket = new Bucket(this.measures);
    for (const member of group.members) {
      const cell: Nullable<Bucket> = cells.get(member) ?? null;
      if (cell !== null) {
        bucket.merge(cell);
      }
    }
    return bucket;
  }

  private values(bucket: Bucket): Array<Nullable<string>> {
    return this.columns.map((c: ValueColumn): Nullable<string> => {
      if (c.measure !== null) {
        return bucket.result(c.measure);
      }
      return c.root === null
        ? null
        : ReportEngine.cell(
            new Evaluator(this.resolver, new BucketContext(bucket, c.index)).evaluate(c.root),
          );
    });
  }

  private fillAttributes(row: RowData, key: string, record: DataRecordSnapshot): void {
    if (this.definition.getSpec().rowSource !== RowSource.FIELD) {
      return;
    }
    let position: number = 1;
    if (this.nameFieldKey !== null) {
      if (row.attributes[position] === null) {
        row.attributes[position] = ReportEngine.text(record.values[this.nameFieldKey] ?? null);
      }
      position += 1;
    }
    for (const c of this.classificationColumns) {
      if (row.attributes[position] === null) {
        const value: CellValue = record.values[c.getFieldKey()] ?? null;
        const source: Nullable<string> = typeof value === 'string' ? value : key;
        const nodeId: Nullable<string> = c.classify(source);
        const node: Nullable<ClassificationNodeDto> =
          nodeId === null
            ? null
            : (c.getNodes().find((n: ClassificationNodeDto): boolean => n.id === nodeId) ?? null);
        row.attributes[position] =
          node === null ? null : node.code === '' ? node.name : `${node.code} ${node.name}`;
      }
      position += 1;
    }
  }

  private warnings(groups: ReadonlyArray<OutputGroup>): string[] {
    const warnings: string[] = [];
    if (this.groups.size > ReportEngine.MAX_GROUPS && this.split.depth() > 0) {
      warnings.push(
        `Hay ${String(this.groups.size)} grupos de columnas; se muestran los primeros ${String(ReportEngine.MAX_GROUPS)}. Reduce el alcance o abre por menos niveles.`,
      );
    }
    const everything: Bucket = new Bucket(this.measures);
    for (const group of groups) {
      if (!group.subtotal) {
        everything.merge(this.merge(this.totals, group));
      }
    }
    const reported: Set<string> = new Set<string>();
    this.measures.forEach((m: Measure, i: number): void => {
      if (everything.mixed(i) && !reported.has(m.key)) {
        reported.add(m.key);
        const currencies: string = [...(everything.currencies[i] ?? [])].sort().join(', ');
        warnings.push(
          `«${m.label}» tiene montos en varias monedas (${currencies}); no se suman entre sí. Conviértelos con una operación de conversión de moneda, filtra por moneda o abre las columnas por compañía.`,
        );
      }
    });
    if (this.unclassified.size > 0) {
      const sample: string[] = [...this.unclassified].sort().slice(0, 5);
      const more: string = this.unclassified.size > sample.length ? ', …' : '';
      const where: string = this.definition.getSpec().includeUnclassified
        ? 'se suman en «Sin clasificar»'
        : 'no se incluyen en la tabla';
      warnings.push(
        `${String(this.unclassified.size)} valor(es) sin clasificar ${where} (${sample.join(', ')}${more}). Asígnalos en Clasificaciones.`,
      );
    }
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

  private static text(value: CellValue): Nullable<string> {
    if (value === null) {
      return null;
    }
    return typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value;
  }

  private rowKey(record: DataRecordSnapshot): Nullable<string> {
    const spec: ReportDefinitionRequest = this.definition.getSpec();
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
      if (typeof value === 'string') {
        this.unclassified.add(value.trim());
      }
      return spec.includeUnclassified ? ReportEngine.UNCLASSIFIED : null;
    }
    return node;
  }

  private fieldRows(groups: ReadonlyArray<OutputGroup>): ReportRowResponse[] {
    return [...this.rows.entries()]
      .sort((a: [string, RowData], b: [string, RowData]): number =>
        a[0].localeCompare(b[0], 'es', { numeric: true }),
      )
      .map(([key, data]: [string, RowData]): ReportRowResponse =>
        this.row(key, key, 0, false, data.cells, groups),
      );
  }

  /** Recorre el árbol: cada nodo muestra su subtotal (sus registros más los de sus descendientes). */
  private classificationRows(
    classification: Classification,
    groups: ReadonlyArray<OutputGroup>,
  ): ReportRowResponse[] {
    const rows: ReportRowResponse[] = [];
    const visit = (node: ClassificationNodeDto, level: number): Map<string, Bucket> => {
      const cells: Map<string, Bucket> = new Map<string, Bucket>();
      const absorb = (source: ReadonlyMap<string, Bucket>): void => {
        for (const [groupKey, bucket] of source) {
          const target: Bucket = cells.get(groupKey) ?? new Bucket(this.measures);
          target.merge(bucket);
          cells.set(groupKey, target);
        }
      };
      const own: Nullable<RowData> = this.rows.get(node.id) ?? null;
      if (own !== null) {
        absorb(own.cells);
      }
      const index: number = rows.length;
      const children: ClassificationNodeDto[] = classification.children(node.id);
      rows.push({ key: node.id, label: node.name, level, total: false, attributes: [], values: [] });
      for (const child of children) {
        absorb(visit(child, level + 1));
      }
      const label: string = node.code === '' ? node.name : `${node.code} ${node.name}`;
      rows[index] = this.row(node.id, label, level, children.length > 0, cells, groups);
      return cells;
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
