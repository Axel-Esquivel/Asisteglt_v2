import {
  Aggregation,
  ClassificationNodeDto,
  ComputedReportResponse,
  NumericNature,
  OrgLevel,
  PivotDimensionDto,
  PivotDto,
  PivotSource,
  PivotValueDto,
  PivotValueKind,
  ReportColumnResponse,
  ReportRowResponse,
} from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { Decimal, Nullable } from '@asisteglt/shared-kernel';
import { Accumulator } from './accumulator';
import { Classification } from './classification';
import { ColumnSplit } from './data-scope';
import { CatalogField, FieldCatalog } from './field-catalog';
import { OrgStructure, OrgUnitSnapshot } from './org-structure';
import { DataRecordSnapshot } from './ports';
import { PresentationConverter } from './presentation-currency';
import { RecordFilter } from './record-filter';

/** Un valor de una dimensión: su clave, su texto y cómo se ordena. */
export class PivotMember {
  public constructor(
    public readonly key: string,
    public readonly label: string,
    public readonly order: string,
  ) {}
}

/** Una dimensión de filas o columnas: a qué valor pertenece cada registro. */
export abstract class PivotDimension {
  public abstract title(): string;

  public abstract member(record: DataRecordSnapshot): PivotMember;

  public static of(
    dto: PivotDimensionDto,
    catalog: FieldCatalog,
    classifications: ReadonlyMap<string, Classification>,
    org: OrgStructure,
  ): PivotDimension {
    switch (dto.source) {
      case PivotSource.FIELD:
        return new FieldDimension(dto.key, catalog);
      case PivotSource.CLASSIFICATION: {
        const classification: Nullable<Classification> = classifications.get(dto.key) ?? null;
        return classification === null
          ? new MissingDimension('Clasificación eliminada')
          : new ClassificationDimension(classification, dto.level);
      }
      case PivotSource.ORG:
        return new OrgDimension(PivotDimension.orgLevel(dto.key), org);
      case PivotSource.CURRENCY:
        return new CurrencyDimension();
      case PivotSource.MONTH:
        return new MonthDimension();
    }
  }

  private static orgLevel(key: string): OrgLevel {
    return Object.values(OrgLevel).find((l: OrgLevel): boolean => l === key) ?? OrgLevel.COMPANY;
  }

  protected static text(value: CellValue): Nullable<string> {
    if (value === null) {
      return null;
    }
    return typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value.trim();
  }
}

/** Un encabezado agrupable; si tiene un encabezado «nombre de», se muestra junto al valor. */
export class FieldDimension extends PivotDimension {
  private readonly nameKey: Nullable<string>;
  private readonly name: string;

  public constructor(
    private readonly key: string,
    catalog: FieldCatalog,
  ) {
    super();
    this.nameKey = catalog.nameFieldOf(key);
    this.name = catalog
      .find(key)
      .map((f: CatalogField): string => f.label)
      .orElse(key);
  }

  public override title(): string {
    return this.name;
  }

  public override member(record: DataRecordSnapshot): PivotMember {
    const value: Nullable<string> = PivotDimension.text(record.values[this.key] ?? null);
    if (value === null || value === '') {
      return new PivotMember('', '—', '￿');
    }
    const name: Nullable<string> =
      this.nameKey === null ? null : PivotDimension.text(record.values[this.nameKey] ?? null);
    return new PivotMember(value, name === null || name === '' ? value : `${value} ${name}`, value);
  }
}

/** El nodo de una clasificación al que pertenece el registro, o su ancestro en un nivel. */
export class ClassificationDimension extends PivotDimension {
  private readonly nodes: ReadonlyMap<string, ClassificationNodeDto>;
  /** Posición de cada nodo en el árbol (recorrido en profundidad), para ordenar como el árbol. */
  private readonly position: ReadonlyMap<string, number>;

  public constructor(
    private readonly classification: Classification,
    /** 0 = el nodo del registro; 1 = su raíz; 2 = el nodo de segundo nivel… */
    private readonly level: number,
  ) {
    super();
    this.nodes = new Map<string, ClassificationNodeDto>(
      classification.getNodes().map((n: ClassificationNodeDto): [string, ClassificationNodeDto] => [n.id, n]),
    );
    const position: Map<string, number> = new Map<string, number>();
    const visit = (parentId: Nullable<string>): void => {
      for (const child of classification.children(parentId)) {
        position.set(child.id, position.size);
        visit(child.id);
      }
    };
    visit(null);
    this.position = position;
  }

  public override title(): string {
    return this.level === 0
      ? this.classification.getName()
      : `${this.classification.getName()} (nivel ${String(this.level)})`;
  }

  public override member(record: DataRecordSnapshot): PivotMember {
    const value: CellValue = record.values[this.classification.getFieldKey()] ?? null;
    const id: Nullable<string> = typeof value === 'string' ? this.classification.classify(value) : null;
    const node: Nullable<ClassificationNodeDto> = id === null ? null : this.at(id);
    if (node === null) {
      return new PivotMember('', 'Sin clasificar', '￿');
    }
    const label: string = node.code === '' ? node.name : `${node.code} ${node.name}`;
    return new PivotMember(node.id, label, String(this.position.get(node.id) ?? 0).padStart(6, '0'));
  }

  /** El ancestro del nivel pedido (o el propio nodo si está más arriba). */
  private at(id: string): Nullable<ClassificationNodeDto> {
    const path: ClassificationNodeDto[] = [];
    let current: Nullable<ClassificationNodeDto> = this.nodes.get(id) ?? null;
    while (current !== null) {
      path.unshift(current);
      current = current.parentId === null ? null : (this.nodes.get(current.parentId) ?? null);
    }
    if (this.level === 0) {
      return path.at(-1) ?? null;
    }
    return path[Math.min(this.level, path.length) - 1] ?? null;
  }
}

/** Un nivel de la estructura organizacional, ordenado como la estructura. */
export class OrgDimension extends PivotDimension {
  private static readonly TITLES: ReadonlyMap<OrgLevel, string> = new Map<OrgLevel, string>([
    [OrgLevel.ORGANIZATION, 'Organización'],
    [OrgLevel.COUNTRY, 'País'],
    [OrgLevel.COMPANY, 'Compañía'],
    [OrgLevel.ENTERPRISE, 'Empresa'],
    [OrgLevel.BRANCH, 'Sucursal'],
  ]);

  private readonly order: ReadonlyMap<string, number>;

  public constructor(
    private readonly level: OrgLevel,
    private readonly org: OrgStructure,
  ) {
    super();
    this.order = new Map<string, number>(
      org.all().map((u: OrgUnitSnapshot, i: number): [string, number] => [u.id, i]),
    );
  }

  public override title(): string {
    return OrgDimension.TITLES.get(this.level) ?? '';
  }

  public override member(record: DataRecordSnapshot): PivotMember {
    const id: Nullable<string> = ColumnSplit.idAt(record, this.level);
    if (id === null) {
      // Empresa y sucursal son opcionales: sin ellas el texto queda vacío.
      return new PivotMember('', '', '￿');
    }
    const unit: Nullable<OrgUnitSnapshot> = this.org.find(id).toNullable();
    return new PivotMember(
      id,
      unit === null ? id : unit.name,
      String(this.order.get(id) ?? 999_999).padStart(6, '0'),
    );
  }
}

export class CurrencyDimension extends PivotDimension {
  public override title(): string {
    return 'Moneda';
  }

  public override member(record: DataRecordSnapshot): PivotMember {
    return new PivotMember(record.currency, record.currency, record.currency);
  }
}

export class MonthDimension extends PivotDimension {
  public override title(): string {
    return 'Mes';
  }

  public override member(record: DataRecordSnapshot): PivotMember {
    const [year, month] = record.period.split('-');
    return new PivotMember(record.period, `${month ?? ''}/${year ?? ''}`, record.period);
  }
}

/** Una dimensión que ya no existe (p. ej. una clasificación eliminada): agrupa todo junto. */
export class MissingDimension extends PivotDimension {
  public constructor(private readonly reason: string) {
    super();
  }

  public override title(): string {
    return this.reason;
  }

  public override member(): PivotMember {
    return new PivotMember('', this.reason, '');
  }
}

/** Un encabezado numérico que se agrega en las celdas, en el período del informe o el anterior. */
class PivotMeasure {
  public constructor(
    public readonly key: string,
    public readonly aggregation: Aggregation,
    public readonly weightKey: Nullable<string>,
    public readonly currencySensitive: boolean,
    public readonly offset: number,
  ) {}

  public static of(fieldKey: string, offset: number, catalog: FieldCatalog): PivotMeasure {
    const field: Nullable<CatalogField> = catalog.find(fieldKey).toNullable();
    const s = field === null ? null : field.snapshot();
    const nature: Nullable<NumericNature> = s === null ? null : s.nature;
    return new PivotMeasure(
      fieldKey,
      s === null ? Aggregation.SUM : s.aggregation,
      s === null ? null : s.weightField,
      nature === NumericNature.AMOUNT || nature === NumericNature.UNIT_PRICE,
      offset,
    );
  }
}

/** Una columna de valores: un encabezado agregado, o la diferencia o el cociente de otras dos. */
class PivotValue {
  public constructor(
    public readonly kind: PivotValueKind,
    public readonly label: string,
    /** Posición de su medida (solo encabezados). */
    public readonly measure: number,
    public readonly left: number,
    public readonly right: number,
  ) {}

  public static label(dto: PivotValueDto, all: ReadonlyArray<PivotValueDto>, catalog: FieldCatalog): string {
    if (dto.label !== '') {
      return dto.label;
    }
    if (dto.kind !== PivotValueKind.FIELD) {
      const name = (i: number): string => {
        const other: Nullable<PivotValueDto> = all[i] ?? null;
        return other === null ? '?' : PivotValue.label(other, all, catalog);
      };
      return dto.kind === PivotValueKind.DIFFERENCE
        ? `${name(dto.left)} − ${name(dto.right)}`
        : `${name(dto.left)} ÷ ${name(dto.right)} %`;
    }
    const key: string = dto.fieldKey ?? '';
    const name: string = catalog
      .find(key)
      .map((f: CatalogField): string => f.label)
      .orElse(key);
    return dto.periodOffset === 0 ? name : `${name} (período anterior)`;
  }
}

/** Celda: un acumulador por valor y las monedas vistas en cada uno. */
class PivotCell {
  private readonly accumulators: Accumulator[];
  private readonly currencies: Array<Set<string>>;

  public constructor(measures: ReadonlyArray<PivotMeasure>) {
    this.accumulators = measures.map((m: PivotMeasure): Accumulator => new Accumulator(m.aggregation));
    this.currencies = measures.map((): Set<string> => new Set<string>());
  }

  public add(index: number, value: Nullable<Decimal>, weight: Nullable<Decimal>, currency: Nullable<string>): void {
    const accumulator: Nullable<Accumulator> = this.accumulators[index] ?? null;
    if (accumulator !== null) {
      accumulator.add(value, weight);
    }
    if (value !== null && currency !== null) {
      (this.currencies[index] ?? new Set<string>()).add(currency);
    }
  }

  public mixed(index: number): Nullable<string> {
    const set: Set<string> = this.currencies[index] ?? new Set<string>();
    return set.size > 1 ? [...set].sort().join(', ') : null;
  }

  public result(index: number): Nullable<string> {
    const accumulator: Nullable<Accumulator> = this.accumulators[index] ?? null;
    return accumulator === null || this.mixed(index) !== null ? null : accumulator.result();
  }
}

/** Un camino de miembros (p. ej. compañía › cuenta) con su clave estable. */
class MemberPath {
  public constructor(public readonly members: ReadonlyArray<PivotMember>) {}

  public static key(members: ReadonlyArray<PivotMember>): string {
    return `${String(members.length)}:${members.map((m: PivotMember): string => m.key).join('\u001f')}`;
  }

  public key(): string {
    return MemberPath.key(this.members);
  }

  public prefix(length: number): MemberPath {
    return new MemberPath(this.members.slice(0, length));
  }

  public static compare(a: MemberPath, b: MemberPath): number {
    for (let i: number = 0; i < Math.min(a.members.length, b.members.length); i += 1) {
      const left: Nullable<PivotMember> = a.members[i] ?? null;
      const right: Nullable<PivotMember> = b.members[i] ?? null;
      const diff: number = (left === null ? '' : left.order).localeCompare(
        right === null ? '' : right.order,
        'es',
        { numeric: true },
      );
      if (diff !== 0) {
        return diff;
      }
    }
    return a.members.length - b.members.length;
  }
}

/** Grupo de columnas de la respuesta: una hoja, un subtotal o el total. */
class PivotColumnGroup {
  public constructor(
    public readonly key: string,
    public readonly labels: ReadonlyArray<string>,
    public readonly subtotal: boolean,
  ) {}
}

/**
 * Tabla dinámica: agrupa los registros filtrados por las dimensiones de filas y columnas que se
 * eligen al diseñarla (encabezados, clasificaciones, niveles de la estructura, moneda o mes) y
 * agrega los valores elegidos en cada cruce, con subtotales por nivel. Nunca suma montos de
 * monedas distintas (salvo con moneda de presentación).
 */
export class PivotEngine {
  public static readonly MAX_ROWS: number = 5000;
  public static readonly MAX_COLUMN_GROUPS: number = 60;

  private readonly rows: PivotDimension[];
  private readonly columns: PivotDimension[];
  private readonly measures: PivotMeasure[] = [];
  private readonly values: PivotValue[];
  /** Celdas por camino de fila (todos los prefijos) y camino de columna (todos los prefijos). */
  private readonly cells: Map<string, Map<string, PivotCell>> = new Map<string, Map<string, PivotCell>>();
  private readonly rowPaths: Map<string, MemberPath> = new Map<string, MemberPath>();
  private readonly columnPaths: Map<string, MemberPath> = new Map<string, MemberPath>();
  private records: number = 0;

  public constructor(
    private readonly spec: PivotDto,
    catalog: FieldCatalog,
    classifications: ReadonlyMap<string, Classification>,
    org: OrgStructure,
    private readonly convertedCurrencies: ReadonlyMap<string, string>,
    private readonly presentation: Nullable<PresentationConverter>,
  ) {
    this.rows = spec.rows.map((d: PivotDimensionDto): PivotDimension =>
      PivotDimension.of(d, catalog, classifications, org),
    );
    this.columns = spec.columns.map((d: PivotDimensionDto): PivotDimension =>
      PivotDimension.of(d, catalog, classifications, org),
    );
    this.values = spec.values.map((v: PivotValueDto): PivotValue => {
      const label: string = PivotValue.label(v, spec.values, catalog);
      if (v.kind !== PivotValueKind.FIELD) {
        return new PivotValue(v.kind, label, -1, v.left, v.right);
      }
      this.measures.push(PivotMeasure.of(v.fieldKey ?? '', v.periodOffset, catalog));
      return new PivotValue(v.kind, label, this.measures.length - 1, 0, 0);
    });
  }

  /** Desplazamientos de período que piden los valores (para leer esos meses). */
  public static offsets(spec: PivotDto): number[] {
    return [
      ...new Set<number>(
        spec.values
          .filter((v: PivotValueDto): boolean => v.kind === PivotValueKind.FIELD)
          .map((v: PivotValueDto): number => v.periodOffset),
      ),
    ];
  }

  /** Agrega un registro que ya pasó el filtro de unidades y nodos; cada valor mira su período. */
  public add(record: DataRecordSnapshot, filter: RecordFilter): void {
    const selected: boolean[] = this.measures.map((m: PivotMeasure): boolean =>
      filter.selects(record.period, m.offset),
    );
    if (!selected.some((s: boolean): boolean => s)) {
      return;
    }
    this.records += 1;
    const row: MemberPath = new MemberPath(this.rows.map((d: PivotDimension): PivotMember => d.member(record)));
    const column: MemberPath = new MemberPath(
      this.columns.map((d: PivotDimension): PivotMember => d.member(record)),
    );
    const rowKey: string = row.key();
    if (!this.rowPaths.has(rowKey) && this.rowPaths.size >= PivotEngine.MAX_ROWS) {
      return;
    }
    this.rowPaths.set(rowKey, row);
    this.columnPaths.set(column.key(), column);
    const targets: PivotCell[] = [];
    for (let i: number = 0; i <= this.rows.length; i += 1) {
      const rowPrefix: string = row.prefix(i).key();
      const byColumn: Map<string, PivotCell> = this.cells.get(rowPrefix) ?? new Map<string, PivotCell>();
      this.cells.set(rowPrefix, byColumn);
      for (let j: number = 0; j <= this.columns.length; j += 1) {
        const columnPrefix: string = column.prefix(j).key();
        const cell: PivotCell = byColumn.get(columnPrefix) ?? new PivotCell(this.measures);
        byColumn.set(columnPrefix, cell);
        targets.push(cell);
      }
    }
    this.measures.forEach((m: PivotMeasure, index: number): void => {
      if (selected[index] !== true) {
        return;
      }
      const raw: Nullable<Decimal> = PivotEngine.decimal(record.values[m.key] ?? null);
      const currency: string = this.convertedCurrencies.get(m.key) ?? record.currency;
      const value: Nullable<Decimal> =
        raw === null || !m.currencySensitive || this.presentation === null
          ? raw
          : this.presentation.convert(record.period, currency, raw);
      const weight: Nullable<Decimal> =
        m.weightKey === null ? null : PivotEngine.decimal(record.values[m.weightKey] ?? null);
      const tracked: Nullable<string> = !m.currencySensitive
        ? null
        : this.presentation === null
          ? currency
          : this.presentation.target();
      for (const cell of targets) {
        cell.add(index, value, weight, tracked);
      }
    });
  }

  public result(id: string, name: string, period: string, periodLabel: string): ComputedReportResponse {
    const groups: PivotColumnGroup[] = this.columnGroups();
    return {
      definitionId: id,
      name,
      period,
      periodLabel,
      records: this.records,
      presentationCurrency: this.presentation === null ? null : this.presentation.target(),
      attributeColumns: [
        {
          key: 'row',
          label:
            this.spec.rowTitle !== ''
              ? this.spec.rowTitle
              : this.rows.map((d: PivotDimension): string => d.title()).join(' › '),
        },
      ],
      columns: groups.flatMap((g: PivotColumnGroup): ReportColumnResponse[] =>
        this.values.map(
          (v: PivotValue, index: number): ReportColumnResponse => ({
            fieldKey: `${g.key}|v${String(index)}`,
            label: v.label,
            group: g.labels,
            subtotal: g.subtotal,
          }),
        ),
      ),
      rows: [
        ...this.bodyRows(groups),
        this.row(
          MemberPath.key([]),
          this.spec.totalLabel === '' ? 'Total' : this.spec.totalLabel,
          0,
          true,
          groups,
        ),
      ],
      warnings: this.warnings(),
    };
  }

  /** Columnas: hojas ordenadas; con subtotales, uno por nivel que cambia y el total al final. */
  private columnGroups(): PivotColumnGroup[] {
    const depth: number = this.columns.length;
    if (depth === 0) {
      return [new PivotColumnGroup(MemberPath.key([]), [], false)];
    }
    const leaves: MemberPath[] = [...this.columnPaths.values()]
      .sort(MemberPath.compare)
      .slice(0, PivotEngine.MAX_COLUMN_GROUPS);
    const pad = (labels: ReadonlyArray<string>): string[] => [
      ...labels,
      ...Array.from({ length: depth - labels.length }, (): string => ''),
    ];
    const result: PivotColumnGroup[] = [];
    leaves.forEach((leaf: MemberPath, i: number): void => {
      result.push(
        new PivotColumnGroup(
          leaf.key(),
          leaf.members.map((m: PivotMember): string => m.label),
          false,
        ),
      );
      if (!this.spec.subtotals) {
        return;
      }
      const next: Nullable<MemberPath> = leaves[i + 1] ?? null;
      for (let level: number = depth - 1; level >= 1; level -= 1) {
        const prefix: MemberPath = leaf.prefix(level);
        if (next !== null && next.prefix(level).key() === prefix.key()) {
          break;
        }
        const members: number = leaves.filter(
          (l: MemberPath): boolean => l.prefix(level).key() === prefix.key(),
        ).length;
        if (members < 2) {
          continue;
        }
        const labels: string[] = prefix.members.map((m: PivotMember): string => m.label);
        result.push(
          new PivotColumnGroup(prefix.key(), pad([...labels.slice(0, -1), `Total ${labels.at(-1) ?? ''}`]), true),
        );
      }
    });
    if (this.spec.subtotals) {
      result.push(new PivotColumnGroup(MemberPath.key([]), pad(['Total']), true));
    }
    return result;
  }

  /** Filas: con subtotales, en árbol (cada grupo muestra su subtotal); sin ellos, solo el detalle. */
  private bodyRows(groups: ReadonlyArray<PivotColumnGroup>): ReportRowResponse[] {
    const leaves: MemberPath[] = [...this.rowPaths.values()].sort(MemberPath.compare);
    const depth: number = this.rows.length;
    if (!this.spec.subtotals || depth === 1) {
      return leaves.map(
        (leaf: MemberPath): ReportRowResponse =>
          this.row(
            leaf.key(),
            leaf.members
              .map((m: PivotMember): string => m.label)
              .filter((l: string): boolean => l !== '')
              .join(' · '),
            0,
            false,
            groups,
          ),
      );
    }
    const rows: ReportRowResponse[] = [];
    const emitted: Set<string> = new Set<string>();
    for (const leaf of leaves) {
      for (let level: number = 1; level <= depth; level += 1) {
        const prefix: MemberPath = leaf.prefix(level);
        const key: string = prefix.key();
        if (emitted.has(key)) {
          continue;
        }
        emitted.add(key);
        const member: Nullable<PivotMember> = prefix.members.at(-1) ?? null;
        rows.push(this.row(key, member === null ? '' : member.label, level - 1, level < depth, groups));
      }
    }
    return rows;
  }

  private row(
    key: string,
    label: string,
    level: number,
    total: boolean,
    groups: ReadonlyArray<PivotColumnGroup>,
  ): ReportRowResponse {
    const byColumn: ReadonlyMap<string, PivotCell> = this.cells.get(key) ?? new Map<string, PivotCell>();
    return {
      key,
      label,
      level,
      total,
      attributes: [label],
      values: groups.flatMap((g: PivotColumnGroup): Array<Nullable<string>> => {
        const cell: Nullable<PivotCell> = byColumn.get(g.key) ?? null;
        return this.cellValues(cell);
      }),
    };
  }

  /** Valores de una celda en el orden de las columnas; las diferencias y cocientes, al final. */
  private cellValues(cell: Nullable<PivotCell>): Array<Nullable<string>> {
    const results: Array<Nullable<Decimal>> = [];
    for (const value of this.values) {
      if (value.kind === PivotValueKind.FIELD) {
        results.push(PivotEngine.decimal(cell === null ? null : cell.result(value.measure)));
        continue;
      }
      const left: Nullable<Decimal> = results[value.left] ?? null;
      const right: Nullable<Decimal> = results[value.right] ?? null;
      if (value.kind === PivotValueKind.DIFFERENCE) {
        results.push(left === null && right === null ? null : (left ?? Decimal.zero()).subtract(right ?? Decimal.zero()));
        continue;
      }
      results.push(
        left === null || right === null || right.isZero()
          ? null
          : left
              .multiply(Decimal.fromInteger(100).unwrap())
              .divide(right)
              .match(
                (d: Decimal): Nullable<Decimal> => d,
                (): Nullable<Decimal> => null,
              ),
      );
    }
    return results.map((d: Nullable<Decimal>): Nullable<string> => (d === null ? null : d.toString()));
  }

  private warnings(): string[] {
    const warnings: string[] = [];
    if (this.rowPaths.size >= PivotEngine.MAX_ROWS) {
      warnings.push(
        `La tabla tiene más de ${String(PivotEngine.MAX_ROWS)} filas; se muestran las primeras. Agrega filtros o agrupa por menos dimensiones.`,
      );
    }
    if (this.columnPaths.size > PivotEngine.MAX_COLUMN_GROUPS) {
      warnings.push(
        `Hay ${String(this.columnPaths.size)} grupos de columnas; se muestran los primeros ${String(PivotEngine.MAX_COLUMN_GROUPS)}.`,
      );
    }
    const total: Nullable<PivotCell> = (this.cells.get(MemberPath.key([])) ?? new Map<string, PivotCell>()).get(
      MemberPath.key([]),
    ) ?? null;
    const reported: Set<string> = new Set<string>();
    this.values.forEach((v: PivotValue): void => {
      const mixed: Nullable<string> =
        total === null || v.kind !== PivotValueKind.FIELD ? null : total.mixed(v.measure);
      if (mixed !== null && !reported.has(v.label)) {
        reported.add(v.label);
        warnings.push(
          `«${v.label}» tiene montos en varias monedas (${mixed}); no se suman entre sí. Usa una moneda de presentación, filtra por moneda o agrupa por moneda o compañía.`,
        );
      }
    });
    const missingRates: Nullable<string> = this.presentation === null ? null : this.presentation.warning();
    if (missingRates !== null) {
      warnings.push(missingRates);
    }
    return warnings;
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
