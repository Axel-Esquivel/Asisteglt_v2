import {
  ClassificationNodeDto,
  FormulaColumnDto,
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

const FORMULA_COLUMN: FieldDecoder<FormulaColumnDto> = new FieldDecoder<FormulaColumnDto>(
  (f: FieldReader): FormulaColumnDto => ({ label: f.string('label'), formula: f.string('formula') }),
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
          measures: f.stringList('measures'),
          profileId: f.nullableString('profileId'),
          companyId: f.nullableString('companyId'),
          onlyWhenFieldKey: f.nullableString('onlyWhenFieldKey'),
          includeUnclassified: f.boolean('includeUnclassified'),
          formulaColumns: f.list('formulaColumns', FORMULA_COLUMN),
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
    public readonly values: Nullable<string>[],
  ) {}
}

export class ComputedReport {
  public constructor(
    public readonly name: string,
    public readonly period: string,
    public readonly records: number,
    public readonly columns: { readonly fieldKey: string; readonly label: string }[],
    public readonly rows: ReportRow[],
    public readonly warnings: string[],
  ) {}

  public static decoder(): FieldDecoder<ComputedReport> {
    const column = new FieldDecoder((f: FieldReader) => ({
      fieldKey: f.string('fieldKey'),
      label: f.string('label'),
    }));
    const row: FieldDecoder<ReportRow> = new FieldDecoder<ReportRow>((f: FieldReader): ReportRow => {
      const raw: unknown = f.raw('values');
      const values: Nullable<string>[] = Array.isArray(raw)
        ? raw.map((v: unknown): Nullable<string> => (typeof v === 'string' ? v : null))
        : [];
      return new ReportRow(f.string('key'), f.string('label'), f.number('level'), f.boolean('total'), values);
    });
    return new FieldDecoder<ComputedReport>(
      (f: FieldReader): ComputedReport =>
        new ComputedReport(
          f.string('name'),
          f.string('period'),
          f.number('records'),
          f.list('columns', column),
          f.list('rows', row),
          f.stringList('warnings'),
        ),
    );
  }

  /** CSV con separador «;» (habitual en hojas de cálculo en español). */
  public toCsv(): string {
    const escape = (text: string): string => (/[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    const header: string = ['Fila', ...this.columns.map((c) => c.label)].map(escape).join(';');
    const lines: string[] = this.rows.map((r: ReportRow): string =>
      [`${'  '.repeat(r.level)}${r.label}`, ...r.values.map((v: Nullable<string>): string => v ?? '')]
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
