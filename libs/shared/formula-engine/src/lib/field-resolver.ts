import { Aggregation, DataType, NumericNature } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';

/** Lo que el motor necesita saber de un encabezado del catálogo. */
export class FieldInfo {
  public constructor(
    public readonly key: string,
    public readonly label: string,
    public readonly dataType: DataType,
    public readonly nature: Nullable<NumericNature>,
    public readonly aggregation: Aggregation,
    public readonly weightKey: Nullable<string>,
    public readonly active: boolean,
  ) {}

  public isNumeric(): boolean {
    return this.dataType === DataType.INTEGER || this.dataType === DataType.DECIMAL;
  }

  public isAggregatable(): boolean {
    return this.isNumeric() && this.nature !== null && this.nature !== NumericNature.DESCRIPTIVE;
  }
}

/** Traduce nombre ↔ clave de los encabezados (docs/12 §2.8.3). */
export abstract class FieldResolver {
  public abstract findByLabel(label: string): Nullable<FieldInfo>;
  public abstract find(key: string): Nullable<FieldInfo>;

  /** Misma comparación que la unicidad del catálogo: sin mayúsculas, tildes ni espacios extra. */
  public static normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  }
}

/** Resolutor sobre una lista de encabezados; ante nombres repetidos prefiere el activo. */
export class ListFieldResolver extends FieldResolver {
  private readonly byKey: Map<string, FieldInfo> = new Map<string, FieldInfo>();
  private readonly byLabel: Map<string, FieldInfo> = new Map<string, FieldInfo>();

  public constructor(fields: ReadonlyArray<FieldInfo>) {
    super();
    for (const field of fields) {
      this.byKey.set(field.key, field);
      const label: string = FieldResolver.normalize(field.label);
      const current: Nullable<FieldInfo> = this.byLabel.get(label) ?? null;
      if (current === null || (!current.active && field.active)) {
        this.byLabel.set(label, field);
      }
    }
  }

  public override findByLabel(label: string): Nullable<FieldInfo> {
    return this.byLabel.get(FieldResolver.normalize(label)) ?? null;
  }

  public override find(key: string): Nullable<FieldInfo> {
    return this.byKey.get(key) ?? null;
  }
}
