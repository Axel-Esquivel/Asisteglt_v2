import { OrgErrorCode, OrgLevel } from '@asisteglt/shared-contracts';
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

export interface OrgUnitSnapshot {
  readonly id: string;
  readonly level: OrgLevel;
  readonly parentId: Nullable<string>;
  readonly code: string;
  readonly name: string;
  readonly currencies: ReadonlyArray<string>;
}

export interface OrgStructureSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly units: ReadonlyArray<OrgUnitSnapshot>;
}

/** Alcance de una carga: organización › país (moneda) › compañía › empresa › sucursal. */
export class EntityScope {
  public constructor(
    public readonly organizationId: string,
    public readonly countryId: string,
    public readonly currency: string,
    public readonly companyId: string,
    public readonly enterpriseId: Nullable<string>,
    public readonly branchId: Nullable<string>,
  ) {}

  public key(): string {
    return [
      this.organizationId,
      this.countryId,
      this.currency,
      this.companyId,
      this.enterpriseId ?? '-',
      this.branchId ?? '-',
    ].join('|');
  }
}

/** Estructura organizacional de un proyecto (un árbol de unidades con niveles fijos). */
export class OrgStructure extends AggregateRoot {
  private static readonly PARENT: ReadonlyMap<OrgLevel, Nullable<OrgLevel>> = new Map<
    OrgLevel,
    Nullable<OrgLevel>
  >([
    [OrgLevel.ORGANIZATION, null],
    [OrgLevel.COUNTRY, OrgLevel.ORGANIZATION],
    [OrgLevel.COMPANY, OrgLevel.COUNTRY],
    [OrgLevel.ENTERPRISE, OrgLevel.COMPANY],
    [OrgLevel.BRANCH, OrgLevel.ENTERPRISE],
  ]);

  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private units: OrgUnitSnapshot[],
  ) {
    super(id);
  }

  public static empty(projectId: EntityId): OrgStructure {
    return new OrgStructure(EntityId.generate(), projectId, []);
  }

  public static restore(s: OrgStructureSnapshot): OrgStructure {
    return new OrgStructure(EntityId.fromString(s.id).unwrap(), EntityId.fromString(s.projectId).unwrap(), [
      ...s.units,
    ]);
  }

  public all(): ReadonlyArray<OrgUnitSnapshot> {
    return this.units;
  }

  public find(id: string): Optional<OrgUnitSnapshot> {
    return Collections.findFirst(this.units, (u: OrgUnitSnapshot): boolean => u.id === id);
  }

  public add(
    level: OrgLevel,
    parentId: Nullable<string>,
    code: string,
    name: string,
    currencies: ReadonlyArray<string>,
  ): Result<OrgUnitSnapshot> {
    const expectedParent: Nullable<OrgLevel> = OrgStructure.PARENT.get(level) ?? null;
    const parent: Nullable<OrgUnitSnapshot> = parentId === null ? null : this.find(parentId).toNullable();
    if (
      (expectedParent === null) !== (parentId === null) ||
      (parentId !== null && (parent === null || parent.level !== expectedParent))
    ) {
      return Result.fail(
        new ValidationError(
          OrgErrorCode.INVALID_PARENT,
          'La unidad superior no corresponde al nivel elegido',
        ),
      );
    }
    return this.validate(level, parentId, code, name, currencies, null).map(
      (unit: OrgUnitSnapshot): OrgUnitSnapshot => {
        this.units = [...this.units, unit];
        return unit;
      },
    );
  }

  public change(
    id: string,
    code: string,
    name: string,
    currencies: ReadonlyArray<string>,
  ): Result<OrgUnitSnapshot> {
    const current: Nullable<OrgUnitSnapshot> = this.find(id).toNullable();
    if (current === null) {
      return Result.fail(OrgStructure.notFound());
    }
    return this.validate(current.level, current.parentId, code, name, currencies, current.id).map(
      (unit: OrgUnitSnapshot): OrgUnitSnapshot => {
        this.units = this.units.map((u: OrgUnitSnapshot): OrgUnitSnapshot => (u.id === id ? unit : u));
        return unit;
      },
    );
  }

  public remove(id: string): Result<OrgStructure> {
    if (!this.find(id).isPresent()) {
      return Result.fail(OrgStructure.notFound());
    }
    if (this.units.some((u: OrgUnitSnapshot): boolean => u.parentId === id)) {
      return Result.fail(
        new ValidationError(
          OrgErrorCode.ORG_UNIT_HAS_CHILDREN,
          'Primero elimina las unidades que dependen de esta',
        ),
      );
    }
    this.units = this.units.filter((u: OrgUnitSnapshot): boolean => u.id !== id);
    return Result.ok(this);
  }

  /** Valida y construye el alcance de una carga (cascada y moneda habilitada en el país). */
  public scope(
    organizationId: string,
    countryId: string,
    currency: string,
    companyId: string,
    enterpriseId: Nullable<string>,
    branchId: Nullable<string>,
  ): Result<EntityScope> {
    const check = (id: Nullable<string>, level: OrgLevel, parentId: Nullable<string>): boolean => {
      if (id === null) {
        return true;
      }
      const unit: Nullable<OrgUnitSnapshot> = this.find(id).toNullable();
      return unit !== null && unit.level === level && unit.parentId === parentId;
    };
    const country: Nullable<OrgUnitSnapshot> = this.find(countryId).toNullable();
    const valid: boolean =
      check(organizationId, OrgLevel.ORGANIZATION, null) &&
      check(countryId, OrgLevel.COUNTRY, organizationId) &&
      check(companyId, OrgLevel.COMPANY, countryId) &&
      check(enterpriseId, OrgLevel.ENTERPRISE, companyId) &&
      (branchId === null || (enterpriseId !== null && check(branchId, OrgLevel.BRANCH, enterpriseId)));
    if (!valid) {
      return Result.fail(
        new ValidationError(
          OrgErrorCode.INVALID_PARENT,
          'El alcance no es coherente con la estructura organizacional',
        ),
      );
    }
    if (country === null || !country.currencies.includes(currency)) {
      return Result.fail(
        new ValidationError(
          OrgErrorCode.INVALID_CURRENCY,
          `La moneda ${currency} no está habilitada en el país`,
        ),
      );
    }
    return Result.ok(new EntityScope(organizationId, countryId, currency, companyId, enterpriseId, branchId));
  }

  public toSnapshot(): OrgStructureSnapshot {
    return { id: this.id.toString(), projectId: this.projectId.toString(), units: this.units };
  }

  private validate(
    level: OrgLevel,
    parentId: Nullable<string>,
    rawCode: string,
    rawName: string,
    rawCurrencies: ReadonlyArray<string>,
    selfId: Nullable<string>,
  ): Result<OrgUnitSnapshot> {
    const code: string = rawCode.trim().toUpperCase();
    const name: string = rawName.trim().replace(/\s+/g, ' ');
    if (code.length < 1 || code.length > 20 || name.length < 2 || name.length > 120) {
      return Result.fail(
        new ValidationError(OrgErrorCode.INVALID_ORG_UNIT, 'Código (1-20) y nombre (2-120) son obligatorios'),
      );
    }
    const duplicate: boolean = this.units.some(
      (u: OrgUnitSnapshot): boolean =>
        u.parentId === parentId && u.level === level && u.code === code && u.id !== selfId,
    );
    if (duplicate) {
      return Result.fail(
        new ConflictError(
          OrgErrorCode.DUPLICATE_ORG_CODE,
          `Ya existe una unidad con el código ${code} en ese nivel`,
        ),
      );
    }
    const currencies: string[] = [
      ...new Set(rawCurrencies.map((c: string): string => c.trim().toUpperCase())),
    ];
    if (
      level === OrgLevel.COUNTRY &&
      (currencies.length === 0 || currencies.some((c: string): boolean => !/^[A-Z]{3}$/.test(c)))
    ) {
      return Result.fail(
        new ValidationError(
          OrgErrorCode.INVALID_CURRENCY,
          'Un país necesita al menos una moneda ISO 4217 (p. ej. GTQ, USD)',
        ),
      );
    }
    return Result.ok({
      id: selfId ?? EntityId.generate().toString(),
      level,
      parentId,
      code,
      name,
      currencies: level === OrgLevel.COUNTRY ? currencies : [],
    });
  }

  private static notFound(): NotFoundError {
    return new NotFoundError(OrgErrorCode.ORG_UNIT_NOT_FOUND, 'La unidad organizacional no existe');
  }
}
