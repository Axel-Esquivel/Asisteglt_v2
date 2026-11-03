import { DataScopeDto, OrgLevel } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { OrgStructure, OrgUnitSnapshot } from './org-structure';
import { DataRecordSnapshot } from './ports';

/** Alcance de una tabla de datos: qué organizaciones, países, monedas y entidades entran. */
export class DataScope {
  private constructor(private readonly dto: DataScopeDto) {}

  public static of(dto: DataScopeDto): DataScope {
    return new DataScope(dto);
  }

  public static all(): DataScopeDto {
    return {
      organizationIds: [],
      countryIds: [],
      currencies: [],
      companyIds: [],
      enterpriseIds: [],
      branchIds: [],
    };
  }

  /** Cada lista vacía deja pasar todo ese nivel. */
  public matches(record: DataRecordSnapshot): boolean {
    return (
      DataScope.allows(this.dto.organizationIds, record.organizationId) &&
      DataScope.allows(this.dto.countryIds, record.countryId) &&
      DataScope.allows(this.dto.currencies, record.currency) &&
      DataScope.allows(this.dto.companyIds, record.companyId) &&
      DataScope.allows(this.dto.enterpriseIds, record.enterpriseId) &&
      DataScope.allows(this.dto.branchIds, record.branchId)
    );
  }

  /**
   * Descripción para encabezados de informe: las unidades del nivel más específico elegido (p. ej.
   * «Compañía A, Compañía B») y las monedas; «Toda la información» si no se eligió nada.
   */
  public describe(org: OrgStructure): string {
    const levels: ReadonlyArray<ReadonlyArray<string>> = [
      this.dto.branchIds,
      this.dto.enterpriseIds,
      this.dto.companyIds,
      this.dto.countryIds,
      this.dto.organizationIds,
    ];
    const chosen: ReadonlyArray<string> =
      levels.find((ids: ReadonlyArray<string>): boolean => ids.length > 0) ?? [];
    const units: string[] = chosen.map((id: string): string => {
      const unit: Nullable<OrgUnitSnapshot> = org.find(id).toNullable();
      return unit === null ? id : unit.name;
    });
    const parts: string[] = [
      ...(units.length > 0 ? [units.join(', ')] : []),
      ...(this.dto.currencies.length > 0 ? [this.dto.currencies.join(', ')] : []),
    ];
    return parts.length === 0 ? 'Toda la información' : parts.join(' · ');
  }

  /** Una única compañía elegida (para cálculos que aún filtran por compañía). */
  public singleCompany(): Nullable<string> {
    return this.dto.companyIds.length === 1 ? (this.dto.companyIds[0] ?? null) : null;
  }

  private static allows(list: ReadonlyArray<string>, value: Nullable<string>): boolean {
    return list.length === 0 || (value !== null && list.includes(value));
  }
}

/** Grupo de columnas: la combinación de unidades de los niveles que abren las columnas. */
export class ColumnGroup {
  public constructor(
    /** Identificador de la unidad en cada nivel (`null` si el registro no la tiene). */
    public readonly ids: ReadonlyArray<Nullable<string>>,
    public readonly labels: ReadonlyArray<string>,
  ) {}

  public key(): string {
    return ColumnGroup.keyOf(this.ids);
  }

  public static keyOf(ids: ReadonlyArray<Nullable<string>>): string {
    return ids.map((id: Nullable<string>): string => id ?? '—').join('›');
  }
}

/**
 * Abre las columnas por niveles de la estructura (p. ej. organización › país › compañía) y
 * ordena los grupos como en la estructura organizacional.
 */
export class ColumnSplit {
  public static readonly LEVEL_ORDER: ReadonlyArray<OrgLevel> = [
    OrgLevel.ORGANIZATION,
    OrgLevel.COUNTRY,
    OrgLevel.COMPANY,
    OrgLevel.ENTERPRISE,
    OrgLevel.BRANCH,
  ];

  /** Niveles que una compañía puede no tener. */
  public static readonly OPTIONAL_LEVELS: ReadonlyArray<OrgLevel> = [OrgLevel.ENTERPRISE, OrgLevel.BRANCH];

  private readonly order: ReadonlyMap<string, number>;

  public constructor(
    private readonly levels: ReadonlyArray<OrgLevel>,
    private readonly org: OrgStructure,
  ) {
    this.order = new Map<string, number>(
      org.all().map((u: OrgUnitSnapshot, i: number): [string, number] => [u.id, i]),
    );
  }

  /** Los niveles en el orden de la estructura, sin repetir. */
  public static normalize(levels: ReadonlyArray<OrgLevel>): OrgLevel[] {
    return ColumnSplit.LEVEL_ORDER.filter((l: OrgLevel): boolean => levels.includes(l));
  }

  public depth(): number {
    return this.levels.length;
  }

  public groupOf(record: DataRecordSnapshot): ColumnGroup {
    const ids: Array<Nullable<string>> = this.levels.map((level: OrgLevel): Nullable<string> =>
      ColumnSplit.idAt(record, level),
    );
    return new ColumnGroup(
      ids,
      ids.map((id: Nullable<string>, i: number): string =>
        this.label(id, this.levels[i] ?? OrgLevel.COMPANY),
      ),
    );
  }

  /** Ordena los grupos por la posición de sus unidades en la estructura. */
  public sort(groups: ReadonlyArray<ColumnGroup>): ColumnGroup[] {
    return [...groups].sort((a: ColumnGroup, b: ColumnGroup): number => {
      for (let i: number = 0; i < a.ids.length; i += 1) {
        const diff: number = this.position(a.ids[i] ?? null) - this.position(b.ids[i] ?? null);
        if (diff !== 0) {
          return diff;
        }
      }
      return 0;
    });
  }

  private position(id: Nullable<string>): number {
    return id === null ? Number.MAX_SAFE_INTEGER : (this.order.get(id) ?? Number.MAX_SAFE_INTEGER - 1);
  }

  /**
   * Nombre de la unidad. Empresa y sucursal son opcionales: si el registro no las tiene, el
   * encabezado queda vacío; en los demás niveles se indica «Sin asignar».
   */
  private label(id: Nullable<string>, level: OrgLevel): string {
    if (id === null) {
      return ColumnSplit.OPTIONAL_LEVELS.includes(level) ? '' : 'Sin asignar';
    }
    const unit: Nullable<OrgUnitSnapshot> = this.org.find(id).toNullable();
    return unit === null ? id : unit.name;
  }

  private static idAt(record: DataRecordSnapshot, level: OrgLevel): Nullable<string> {
    switch (level) {
      case OrgLevel.ORGANIZATION:
        return record.organizationId;
      case OrgLevel.COUNTRY:
        return record.countryId;
      case OrgLevel.COMPANY:
        return record.companyId;
      case OrgLevel.ENTERPRISE:
        return record.enterpriseId;
      case OrgLevel.BRANCH:
        return record.branchId;
    }
  }
}
