import {
  Aggregation,
  CatalogFieldResponse,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
} from '@asisteglt/shared-contracts';
import { FieldDecoder, FieldReader, Nullable } from '@asisteglt/shared-kernel';
import { ReportsLabels } from './reports-labels';

export class CatalogFieldView {
  public constructor(private readonly s: CatalogFieldResponse) {}

  public static decoder(): FieldDecoder<CatalogFieldView> {
    return new FieldDecoder<CatalogFieldView>(
      (f: FieldReader): CatalogFieldView =>
        new CatalogFieldView({
          key: f.string('key'),
          label: f.string('label'),
          origin: f.oneOf('origin', Object.values(FieldOrigin)),
          role: f.oneOf('role', Object.values(FieldRole)),
          dataType: f.oneOf('dataType', Object.values(DataType)),
          nature: f.raw('nature') === null ? null : f.oneOf('nature', Object.values(NumericNature)),
          aggregation: f.oneOf('aggregation', Object.values(Aggregation)),
          describes: f.nullableString('describes'),
          weightField: f.nullableString('weightField'),
          active: f.boolean('active'),
        }),
    );
  }

  public get key(): string {
    return this.s.key;
  }

  public get label(): string {
    return this.s.label;
  }

  public get role(): FieldRole {
    return this.s.role;
  }

  public get dataType(): DataType {
    return this.s.dataType;
  }

  public get nature(): Nullable<NumericNature> {
    return this.s.nature;
  }

  public get origin(): FieldOrigin {
    return this.s.origin;
  }

  public get active(): boolean {
    return this.s.active;
  }

  public raw(): CatalogFieldResponse {
    return this.s;
  }

  public displayLabel(): string {
    return this.s.active ? this.s.label : `${this.s.label} (inactivo)`;
  }

  public roleLabel(): string {
    return ReportsLabels.label(ReportsLabels.ROLES, this.s.role);
  }

  public typeLabel(): string {
    return ReportsLabels.label(ReportsLabels.TYPES, this.s.dataType);
  }

  public natureLabel(): string {
    return this.s.nature === null ? '—' : ReportsLabels.label(ReportsLabels.NATURES, this.s.nature);
  }

  public aggregationLabel(): string {
    return ReportsLabels.label(ReportsLabels.AGGREGATIONS, this.s.aggregation);
  }

  public isIdentifier(): boolean {
    return this.s.role === FieldRole.IDENTIFIER;
  }

  public isImported(): boolean {
    return this.s.origin === FieldOrigin.IMPORTED;
  }

  public isAggregatable(): boolean {
    return this.isNumeric() && this.s.nature !== null && this.s.nature !== NumericNature.DESCRIPTIVE;
  }

  public isGroupable(): boolean {
    return !this.isAggregatable();
  }

  public isClassifiable(): boolean {
    const byRole: boolean = this.s.role === FieldRole.IDENTIFIER || this.s.role === FieldRole.IDENTIFIER_NAME;
    return byRole && (this.s.dataType === DataType.TEXT || this.s.dataType === DataType.INTEGER);
  }

  public isBoolean(): boolean {
    return this.s.dataType === DataType.BOOLEAN;
  }

  public isNumeric(): boolean {
    return this.s.dataType === DataType.INTEGER || this.s.dataType === DataType.DECIMAL;
  }
}

/** Catálogo del proyecto: resuelve claves a nombres vigentes. */
export class CatalogView {
  public constructor(
    public readonly version: number,
    public readonly fields: CatalogFieldView[],
  ) {}

  public static empty(): CatalogView {
    return new CatalogView(0, []);
  }

  public static decoder(): FieldDecoder<CatalogView> {
    return new FieldDecoder<CatalogView>(
      (f: FieldReader): CatalogView =>
        new CatalogView(f.number('version'), f.list('fields', CatalogFieldView.decoder())),
    );
  }

  public find(key: string): Nullable<CatalogFieldView> {
    return this.fields.find((field: CatalogFieldView): boolean => field.key === key) ?? null;
  }

  public labelOf(key: string): string {
    const field: Nullable<CatalogFieldView> = this.find(key);
    return field === null ? key : field.displayLabel();
  }

  public labels(): ReadonlyMap<string, string> {
    return new Map<string, string>(
      this.fields.map((f: CatalogFieldView): [string, string] => [f.key, f.label]),
    );
  }

  public active(): CatalogFieldView[] {
    return this.fields.filter((f: CatalogFieldView): boolean => f.active);
  }

  public importable(): CatalogFieldView[] {
    return this.active().filter((f: CatalogFieldView): boolean => f.isImported());
  }

  public derived(): CatalogFieldView[] {
    return this.active().filter((f: CatalogFieldView): boolean => !f.isImported());
  }

  public identifiers(): CatalogFieldView[] {
    return this.active().filter((f: CatalogFieldView): boolean => f.isIdentifier());
  }

  public weightable(): CatalogFieldView[] {
    return this.active().filter(
      (f: CatalogFieldView): boolean =>
        f.nature === NumericNature.AMOUNT || f.nature === NumericNature.QUANTITY,
    );
  }
}
