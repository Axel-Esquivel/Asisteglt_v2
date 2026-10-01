import {
  Aggregation,
  CatalogErrorCode,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
} from '@asisteglt/shared-contracts';
import {
  AggregateRoot,
  Collections,
  ConflictError,
  EntityId,
  NotFoundError,
  Nullable,
  Optional,
  Result,
  ValidationError,
} from '@asisteglt/shared-kernel';

/** Nombre visible de un encabezado; se compara normalizado (sin mayúsculas, tildes ni espacios extra). */
export class FieldLabel {
  private constructor(
    public readonly value: string,
    public readonly normalized: string,
  ) {}

  public static create(raw: string): Result<FieldLabel> {
    const value: string = raw.trim().replace(/\s+/g, ' ');
    if (value.length < 1 || value.length > 80) {
      return Result.fail(
        new ValidationError(
          CatalogErrorCode.INVALID_FIELD_LABEL,
          'El nombre debe tener entre 1 y 80 caracteres',
        ),
      );
    }
    if (/[[\]]/.test(value)) {
      return Result.fail(
        new ValidationError(CatalogErrorCode.INVALID_FIELD_LABEL, 'El nombre no puede contener corchetes'),
      );
    }
    return Result.ok(new FieldLabel(value, FieldLabel.normalize(value)));
  }

  public static normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  }
}

export interface CatalogFieldSnapshot {
  readonly key: string;
  readonly label: string;
  readonly origin: FieldOrigin;
  readonly role: FieldRole;
  readonly dataType: DataType;
  readonly nature: Nullable<NumericNature>;
  readonly aggregation: Aggregation;
  readonly describes: Nullable<string>;
  readonly weightField: Nullable<string>;
  readonly active: boolean;
}

export interface FieldCatalogSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly version: number;
  readonly fields: ReadonlyArray<CatalogFieldSnapshot>;
}

/** Definición de un encabezado a validar (sin clave ni estado). */
export interface FieldDefinition {
  readonly label: string;
  readonly origin: FieldOrigin;
  readonly role: FieldRole;
  readonly dataType: DataType;
  readonly nature: Nullable<NumericNature>;
  readonly aggregation: Nullable<Aggregation>;
  readonly describes: Nullable<string>;
  readonly weightField: Nullable<string>;
}

/** Encabezado del catálogo con las reglas de rol, tipo y naturaleza (docs/12 §2). */
export class CatalogField {
  public constructor(private readonly s: CatalogFieldSnapshot) {}

  public get key(): string {
    return this.s.key;
  }

  public get label(): string {
    return this.s.label;
  }

  public isActive(): boolean {
    return this.s.active;
  }

  public isNumeric(): boolean {
    return this.s.dataType === DataType.INTEGER || this.s.dataType === DataType.DECIMAL;
  }

  /** Se puede sumar o promediar (montos, cantidades, tasas y precios unitarios). */
  public isAggregatable(): boolean {
    return this.isNumeric() && this.s.nature !== null && this.s.nature !== NumericNature.DESCRIPTIVE;
  }

  /** Se puede usar para agrupar (texto, descriptivo, fecha, sí/no). */
  public isGroupable(): boolean {
    return !this.isAggregatable();
  }

  public isClassifiable(): boolean {
    const byRole: boolean = this.s.role === FieldRole.IDENTIFIER || this.s.role === FieldRole.IDENTIFIER_NAME;
    return byRole && (this.s.dataType === DataType.TEXT || this.s.dataType === DataType.INTEGER);
  }

  public snapshot(): CatalogFieldSnapshot {
    return this.s;
  }
}

/** Catálogo de encabezados del proyecto: nombres libres y únicos respaldados por una clave interna. */
export class FieldCatalog extends AggregateRoot {
  private static readonly KEY_ALPHABET: string = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private version: number,
    private fields: CatalogFieldSnapshot[],
  ) {
    super(id);
  }

  public static empty(projectId: EntityId): FieldCatalog {
    return new FieldCatalog(EntityId.generate(), projectId, 0, []);
  }

  public static restore(s: FieldCatalogSnapshot): FieldCatalog {
    return new FieldCatalog(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.projectId).unwrap(),
      s.version,
      [...s.fields],
    );
  }

  public getVersion(): number {
    return this.version;
  }

  public all(): CatalogField[] {
    return this.fields.map((f: CatalogFieldSnapshot): CatalogField => new CatalogField(f));
  }

  public find(key: string): Optional<CatalogField> {
    return Collections.findFirst(this.fields, (f: CatalogFieldSnapshot): boolean => f.key === key).map(
      (f: CatalogFieldSnapshot): CatalogField => new CatalogField(f),
    );
  }

  public labels(): ReadonlyMap<string, string> {
    return new Map<string, string>(
      this.fields.map((f: CatalogFieldSnapshot): [string, string] => [f.key, f.label]),
    );
  }

  public add(definition: FieldDefinition): Result<CatalogField> {
    return this.validate(definition, null).map((snapshot: CatalogFieldSnapshot): CatalogField => {
      this.fields = [...this.fields, snapshot];
      this.version += 1;
      return new CatalogField(snapshot);
    });
  }

  /** Cambia la definición; el tipo y la naturaleza solo si el encabezado no está en uso. */
  public redefine(key: string, definition: FieldDefinition, inUse: boolean): Result<CatalogField> {
    const current: Nullable<CatalogFieldSnapshot> = this.snapshotOf(key);
    if (current === null) {
      return Result.fail(FieldCatalog.notFound());
    }
    const structural: boolean =
      current.role !== definition.role ||
      current.dataType !== definition.dataType ||
      current.nature !== definition.nature ||
      current.origin !== definition.origin;
    if (inUse && structural) {
      return Result.fail(
        new ConflictError(
          CatalogErrorCode.FIELD_IN_USE,
          `«${current.label}» ya se usa; su rol, tipo y naturaleza no se pueden cambiar`,
        ),
      );
    }
    return this.validate(definition, current).map((snapshot: CatalogFieldSnapshot): CatalogField => {
      this.fields = this.fields.map((f: CatalogFieldSnapshot): CatalogFieldSnapshot =>
        f.key === key ? snapshot : f,
      );
      this.version += 1;
      return new CatalogField(snapshot);
    });
  }

  public rename(key: string, rawLabel: string): Result<CatalogField> {
    const current: Nullable<CatalogFieldSnapshot> = this.snapshotOf(key);
    if (current === null) {
      return Result.fail(FieldCatalog.notFound());
    }
    return this.uniqueLabel(rawLabel, key).map((label: FieldLabel): CatalogField => {
      const renamed: CatalogFieldSnapshot = { ...current, label: label.value };
      this.fields = this.fields.map((f: CatalogFieldSnapshot): CatalogFieldSnapshot =>
        f.key === key ? renamed : f,
      );
      this.version += 1;
      return new CatalogField(renamed);
    });
  }

  public deactivate(key: string, usages: ReadonlyArray<string>, force: boolean): Result<CatalogField> {
    const current: Nullable<CatalogFieldSnapshot> = this.snapshotOf(key);
    if (current === null) {
      return Result.fail(FieldCatalog.notFound());
    }
    if (usages.length > 0 && !force) {
      return Result.fail(
        new ConflictError(
          CatalogErrorCode.FIELD_IN_USE,
          `«${current.label}» se usa en: ${usages.join(', ')}`,
        ),
      );
    }
    const inactive: CatalogFieldSnapshot = { ...current, active: false };
    this.fields = this.fields.map((f: CatalogFieldSnapshot): CatalogFieldSnapshot =>
      f.key === key ? inactive : f,
    );
    this.version += 1;
    return Result.ok(new CatalogField(inactive));
  }

  public toSnapshot(): FieldCatalogSnapshot {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      version: this.version,
      fields: this.fields,
    };
  }

  private snapshotOf(key: string): Nullable<CatalogFieldSnapshot> {
    return this.fields.find((f: CatalogFieldSnapshot): boolean => f.key === key) ?? null;
  }

  private uniqueLabel(raw: string, selfKey: Nullable<string>): Result<FieldLabel> {
    return FieldLabel.create(raw).flatMap((label: FieldLabel): Result<FieldLabel> => {
      const clash: boolean = this.fields.some(
        (f: CatalogFieldSnapshot): boolean =>
          f.active && f.key !== selfKey && FieldLabel.normalize(f.label) === label.normalized,
      );
      return clash
        ? Result.fail(
            new ConflictError(
              CatalogErrorCode.DUPLICATE_FIELD_LABEL,
              `Ya existe un encabezado activo llamado «${label.value}»`,
            ),
          )
        : Result.ok(label);
    });
  }

  private validate(
    d: FieldDefinition,
    current: Nullable<CatalogFieldSnapshot>,
  ): Result<CatalogFieldSnapshot> {
    const invalid = (message: string): Result<CatalogFieldSnapshot> =>
      Result.fail(new ValidationError(CatalogErrorCode.INVALID_FIELD_DEFINITION, message));
    const numeric: boolean = d.dataType === DataType.INTEGER || d.dataType === DataType.DECIMAL;
    let nature: Nullable<NumericNature> = numeric ? d.nature : null;
    if (d.role === FieldRole.IDENTIFIER) {
      if (d.dataType !== DataType.TEXT && d.dataType !== DataType.INTEGER) {
        return invalid('Un identificador debe ser Texto o Número entero');
      }
      nature = d.dataType === DataType.INTEGER ? NumericNature.DESCRIPTIVE : null;
    }
    if (d.role === FieldRole.IDENTIFIER_NAME && d.dataType !== DataType.TEXT) {
      return invalid('El nombre de un identificador debe ser Texto');
    }
    if (numeric && nature === null) {
      return invalid(
        'Un encabezado numérico necesita su naturaleza (monto, cantidad, tasa, precio unitario o descriptivo)',
      );
    }
    if (d.role === FieldRole.IDENTIFIER_NAME) {
      const target: Nullable<CatalogFieldSnapshot> =
        d.describes === null ? null : this.snapshotOf(d.describes);
      if (target === null || target.role !== FieldRole.IDENTIFIER || !target.active) {
        return invalid('Indica a qué identificador activo describe este nombre');
      }
    }
    const weighted: boolean = nature === NumericNature.RATE || nature === NumericNature.UNIT_PRICE;
    let weightField: Nullable<string> = null;
    if (weighted && d.weightField !== null) {
      const weight: Nullable<CatalogFieldSnapshot> = this.snapshotOf(d.weightField);
      if (
        weight === null ||
        !weight.active ||
        (weight.nature !== NumericNature.AMOUNT && weight.nature !== NumericNature.QUANTITY)
      ) {
        return invalid('«Ponderado por» debe ser un monto o una cantidad activos');
      }
      weightField = weight.key;
    }
    const aggregation: Result<Aggregation> = FieldCatalog.aggregationFor(nature, d.aggregation, weightField);
    if (!aggregation.isOk()) {
      return Result.fail(
        aggregation.errorOrNull() ??
          new ValidationError(CatalogErrorCode.INVALID_FIELD_DEFINITION, 'Agregación inválida'),
      );
    }
    return this.uniqueLabel(d.label, current === null ? null : current.key).map(
      (label: FieldLabel): CatalogFieldSnapshot => ({
        key: current === null ? this.newKey() : current.key,
        label: label.value,
        origin: d.origin,
        role: d.role,
        dataType: d.dataType,
        nature,
        aggregation: aggregation.unwrap(),
        describes: d.role === FieldRole.IDENTIFIER_NAME ? d.describes : null,
        weightField,
        active: current === null ? true : current.active,
      }),
    );
  }

  /** Agregaciones permitidas por naturaleza; una tasa nunca se suma. */
  public static aggregationFor(
    nature: Nullable<NumericNature>,
    requested: Nullable<Aggregation>,
    weightField: Nullable<string>,
  ): Result<Aggregation> {
    const additive: boolean = nature === NumericNature.AMOUNT || nature === NumericNature.QUANTITY;
    const weighted: boolean = nature === NumericNature.RATE || nature === NumericNature.UNIT_PRICE;
    const allowed: Aggregation[] = additive
      ? [
          Aggregation.SUM,
          Aggregation.AVERAGE,
          Aggregation.MIN,
          Aggregation.MAX,
          Aggregation.LAST,
          Aggregation.COUNT,
          Aggregation.NONE,
        ]
      : weighted
        ? [
            Aggregation.WEIGHTED_AVERAGE,
            Aggregation.AVERAGE,
            Aggregation.MIN,
            Aggregation.MAX,
            Aggregation.LAST,
            Aggregation.COUNT,
            Aggregation.NONE,
          ]
        : [Aggregation.NONE, Aggregation.COUNT];
    const fallback: Aggregation = additive
      ? Aggregation.SUM
      : weighted && weightField !== null
        ? Aggregation.WEIGHTED_AVERAGE
        : Aggregation.NONE;
    const chosen: Aggregation = requested ?? fallback;
    if (!allowed.includes(chosen) || (chosen === Aggregation.WEIGHTED_AVERAGE && weightField === null)) {
      return Result.fail(
        new ValidationError(
          CatalogErrorCode.INVALID_FIELD_DEFINITION,
          'La agregación no es válida para la naturaleza del encabezado',
        ),
      );
    }
    return Result.ok(chosen);
  }

  private newKey(): string {
    let key: string = '';
    do {
      key = 'f_';
      for (let i = 0; i < 6; i += 1) {
        key += FieldCatalog.KEY_ALPHABET.charAt(Math.floor(Math.random() * FieldCatalog.KEY_ALPHABET.length));
      }
    } while (this.snapshotOf(key) !== null);
    return key;
  }

  private static notFound(): NotFoundError {
    return new NotFoundError(CatalogErrorCode.FIELD_NOT_FOUND, 'El encabezado no existe');
  }
}
