import {
  ClassificationNodeDto,
  DataColumnDto,
  DataColumnKind,
  DataScopeDto,
  OrgLevel,
  PeriodGrouping,
  PeriodValue,
  PresentationCurrencyDto,
  RateQuote,
  ReportDefinitionRequest,
  RowSource,
} from '@asisteglt/shared-contracts';
import { FieldDecoder, FieldReader, Nullable } from '@asisteglt/shared-kernel';

const NODE: FieldDecoder<ClassificationNodeDto> = new FieldDecoder<ClassificationNodeDto>(
  (f: FieldReader): ClassificationNodeDto => ({
    id: f.string('id'),
    parentId: f.nullableString('parentId'),
    code: f.string('code'),
    name: f.string('name'),
    patterns: f.stringList('patterns'),
  }),
);

const DATA_COLUMN: FieldDecoder<DataColumnDto> = new FieldDecoder<DataColumnDto>(
  (f: FieldReader): DataColumnDto => ({
    kind: f.oneOf('kind', Object.values(DataColumnKind)),
    label: f.string('label'),
    fieldKey: f.nullableString('fieldKey'),
    formula: f.nullableString('formula'),
    periodValue: f.oneOf('periodValue', Object.values(PeriodValue)),
    periodOffset: f.number('periodOffset'),
  }),
);

const SCOPE: FieldDecoder<DataScopeDto> = new FieldDecoder<DataScopeDto>((f: FieldReader): DataScopeDto => ({
  organizationIds: f.stringList('organizationIds'),
  countryIds: f.stringList('countryIds'),
  currencies: f.stringList('currencies'),
  companyIds: f.stringList('companyIds'),
  enterpriseIds: f.stringList('enterpriseIds'),
  branchIds: f.stringList('branchIds'),
}));

const PRESENTATION: FieldDecoder<PresentationCurrencyDto> = new FieldDecoder<PresentationCurrencyDto>(
  (f: FieldReader): PresentationCurrencyDto => ({
    targetCurrency: f.string('targetCurrency'),
    collectionId: f.string('collectionId'),
    rateFieldKey: f.string('rateFieldKey'),
    currencyFieldKey: f.string('currencyFieldKey'),
    quote: f.oneOf('quote', Object.values(RateQuote)),
  }),
);

export class ClassificationView {
  public constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly fieldKey: string,
    public readonly nodes: ClassificationNodeDto[],
  ) {}

  public static decoder(): FieldDecoder<ClassificationView> {
    return new FieldDecoder<ClassificationView>(
      (f: FieldReader): ClassificationView =>
        new ClassificationView(f.string('id'), f.string('name'), f.string('fieldKey'), f.list('nodes', NODE)),
    );
  }
}

export class ReportDefinitionView {
  public constructor(
    public readonly id: string,
    public readonly spec: ReportDefinitionRequest,
  ) {}

  public static decoder(): FieldDecoder<ReportDefinitionView> {
    return new FieldDecoder<ReportDefinitionView>(
      (f: FieldReader): ReportDefinitionView =>
        new ReportDefinitionView(f.string('id'), {
          name: f.string('name'),
          rowSource: f.oneOf('rowSource', Object.values(RowSource)),
          classificationId: f.nullableString('classificationId'),
          rowFieldKey: f.nullableString('rowFieldKey'),
          classificationColumns: f.stringList('classificationColumns'),
          columns: f.list('columns', DATA_COLUMN),
          profileId: f.nullableString('profileId'),
          scope: f.nested('scope', SCOPE),
          periodGrouping: f.oneOf('periodGrouping', Object.values(PeriodGrouping)),
          columnSplit: f.oneOfList('columnSplit', Object.values(OrgLevel)),
          subtotals: f.boolean('subtotals'),
          onlyWhenFieldKey: f.nullableString('onlyWhenFieldKey'),
          includeUnclassified: f.boolean('includeUnclassified'),
          presentation: f.raw('presentation') === null ? null : f.nested('presentation', PRESENTATION),
        }),
    );
  }

  public get name(): string {
    return this.spec.name;
  }
}

export class ReportRow {
  public constructor(
    public readonly key: string,
    public readonly label: string,
    public readonly level: number,
    public readonly total: boolean,
    public readonly attributes: Nullable<string>[],
    public readonly values: Nullable<string>[],
  ) {}
}

/** Columna de valores calculada: su clave, título y los grupos que la contienen. */
export class ReportColumn {
  public constructor(
    public readonly fieldKey: string,
    public readonly label: string,
    public readonly group: ReadonlyArray<string>,
    public readonly subtotal: boolean,
  ) {}

  /** Título completo, p. ej. «Grupo › Compañía A › Saldo». */
  public fullLabel(): string {
    return [...this.group.filter((g: string): boolean => g !== ''), this.label].join(' › ');
  }
}

/** Celda de encabezado agrupada (abarca varias columnas de valores). */
export class HeaderCell {
  public constructor(
    public readonly label: string,
    public readonly span: number,
    public readonly subtotal: boolean,
  ) {}
}

export class ComputedReport {
  public constructor(
    public readonly name: string,
    public readonly period: string,
    public readonly periodLabel: string,
    public readonly records: number,
    public readonly presentationCurrency: Nullable<string>,
    public readonly attributeColumns: { readonly key: string; readonly label: string }[],
    public readonly columns: ReportColumn[],
    public readonly rows: ReportRow[],
    public readonly warnings: string[],
  ) {}

  public static decoder(): FieldDecoder<ComputedReport> {
    const attribute = new FieldDecoder((f: FieldReader) => ({
      key: f.string('key'),
      label: f.string('label'),
    }));
    const column: FieldDecoder<ReportColumn> = new FieldDecoder<ReportColumn>(
      (f: FieldReader): ReportColumn =>
        new ReportColumn(
          f.string('fieldKey'),
          f.string('label'),
          f.stringList('group'),
          f.boolean('subtotal'),
        ),
    );
    const texts = (raw: unknown): Nullable<string>[] =>
      Array.isArray(raw) ? raw.map((v: unknown): Nullable<string> => (typeof v === 'string' ? v : null)) : [];
    const row: FieldDecoder<ReportRow> = new FieldDecoder<ReportRow>(
      (f: FieldReader): ReportRow =>
        new ReportRow(
          f.string('key'),
          f.string('label'),
          f.number('level'),
          f.boolean('total'),
          texts(f.raw('attributes')),
          texts(f.raw('values')),
        ),
    );
    return new FieldDecoder<ComputedReport>(
      (f: FieldReader): ComputedReport =>
        new ComputedReport(
          f.string('name'),
          f.string('period'),
          f.string('periodLabel'),
          f.number('records'),
          f.nullableString('presentationCurrency'),
          f.list('attributeColumns', attribute),
          f.list('columns', column),
          f.list('rows', row),
          f.stringList('warnings'),
        ),
    );
  }

  /** Niveles de grupos de las columnas (0 = sin grupos). */
  public depth(): number {
    return this.columns.reduce((max: number, c: ReportColumn): number => Math.max(max, c.group.length), 0);
  }

  /**
   * Filas de encabezado agrupadas: una por nivel de grupo; las columnas contiguas con los mismos
   * grupos hasta ese nivel se unen en una sola celda.
   */
  public headerRows(): HeaderCell[][] {
    const depth: number = this.depth();
    const rows: HeaderCell[][] = [];
    for (let level: number = 0; level < depth; level += 1) {
      const cells: HeaderCell[] = [];
      let previous: Nullable<string> = null;
      for (const column of this.columns) {
        const path: string =
          column.group.slice(0, level + 1).join('\u0000') + (column.subtotal ? '\u0001' : '');
        const last: Nullable<HeaderCell> = cells.at(-1) ?? null;
        if (last !== null && path === previous) {
          cells[cells.length - 1] = new HeaderCell(last.label, last.span + 1, last.subtotal);
        } else {
          cells.push(new HeaderCell(column.group[level] ?? '', 1, column.subtotal));
        }
        previous = path;
      }
      rows.push(cells);
    }
    return rows;
  }

  /** CSV con separador «;» (habitual en hojas de cálculo en español). */
  public toCsv(): string {
    const escape = (text: string): string => (/[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    const header: string = [
      ...this.attributeColumns.map((c) => c.label),
      ...this.columns.map((c: ReportColumn): string => c.fullLabel()),
    ]
      .map(escape)
      .join(';');
    const lines: string[] = this.rows.map((r: ReportRow): string =>
      [
        ...this.attributeColumns.map((_c, i: number): string =>
          i === 0 ? `${'  '.repeat(r.level)}${r.label}` : (r.attributes[i] ?? ''),
        ),
        ...r.values.map((v: Nullable<string>): string => v ?? ''),
      ]
        .map(escape)
        .join(';'),
    );
    return [header, ...lines].join('\r\n');
  }
}

/** Un valor real del encabezado clasificable (p. ej. una cuenta) en los datos publicados. */
export class ClassifiableValue {
  public readonly label: string;
  private readonly searchText: string;

  public constructor(
    public readonly value: string,
    public readonly name: Nullable<string>,
    public readonly firstPeriod: string,
    public readonly lastPeriod: string,
    public readonly records: number,
  ) {
    this.label = name === null ? value : `${value} · ${name}`;
    this.searchText = this.label.toLowerCase();
  }

  /** Valor que no aparece en los datos (p. ej. una cuenta escrita a mano). */
  public static unknown(value: string): ClassifiableValue {
    return new ClassifiableValue(value, null, '', '', 0);
  }

  public static decoder(): FieldDecoder<ClassifiableValue> {
    return new FieldDecoder<ClassifiableValue>(
      (f: FieldReader): ClassifiableValue =>
        new ClassifiableValue(
          f.string('value'),
          f.nullableString('name'),
          f.string('firstPeriod'),
          f.string('lastPeriod'),
          f.number('records'),
        ),
    );
  }

  /** Coincide si todas las palabras buscadas aparecen en el código o el nombre. */
  public matches(words: ReadonlyArray<string>): boolean {
    return words.every((w: string): boolean => this.searchText.includes(w));
  }
}

/** Valores distintos de un encabezado clasificable en todos los datos publicados del proyecto. */
export class ClassifiableValues {
  private readonly byValue: ReadonlyMap<string, ClassifiableValue>;
  private readonly hasHistory: boolean;

  public constructor(
    public readonly fieldKey: string,
    public readonly latestPeriod: Nullable<string>,
    public readonly values: ReadonlyArray<ClassifiableValue>,
    public readonly truncated: boolean,
  ) {
    this.byValue = new Map<string, ClassifiableValue>(
      values.map((v: ClassifiableValue): [string, ClassifiableValue] => [
        ClassifiableValues.normalize(v.value),
        v,
      ]),
    );
    this.hasHistory = values.some(
      (v: ClassifiableValue): boolean => latestPeriod !== null && v.firstPeriod < latestPeriod,
    );
  }

  public static empty(fieldKey: string): ClassifiableValues {
    return new ClassifiableValues(fieldKey, null, [], false);
  }

  public static decoder(): FieldDecoder<ClassifiableValues> {
    return new FieldDecoder<ClassifiableValues>(
      (f: FieldReader): ClassifiableValues =>
        new ClassifiableValues(
          f.string('fieldKey'),
          f.nullableString('latestPeriod'),
          f.list('values', ClassifiableValue.decoder()),
          f.boolean('truncated'),
        ),
    );
  }

  private static normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  /** El valor tal como aparece en los datos o, si no aparece, uno sin nombre. */
  public find(value: string): ClassifiableValue {
    return this.byValue.get(ClassifiableValues.normalize(value)) ?? ClassifiableValue.unknown(value.trim());
  }

  /** Aparece por primera vez en el último período cargado (y antes ya había otros períodos). */
  public isNew(value: ClassifiableValue): boolean {
    return this.hasHistory && value.firstPeriod === this.latestPeriod;
  }

  /** Hasta `limit` valores que contienen todas las palabras de `query`. */
  public search(query: string, limit: number): ClassifiableValue[] {
    const words: string[] = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string): boolean => w.length > 0);
    const found: ClassifiableValue[] = [];
    for (const v of this.values) {
      if (found.length >= limit) {
        break;
      }
      if (v.matches(words)) {
        found.push(v);
      }
    }
    return found;
  }
}
