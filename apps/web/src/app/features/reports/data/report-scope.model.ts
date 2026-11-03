import { ParamMap } from '@angular/router';
import { DataScopeDto, OrgLevel } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { OrgTree, OrgUnitView } from './org.model';
import { Option } from './reports-labels';

/**
 * Alcance que elige quien genera un informe (organizaciones, países, monedas, compañías, empresas
 * y sucursales; una lista vacía deja pasar todo el nivel). Viaja en la URL de la vista de impresión.
 */
export class ReportScope {
  private static readonly KEYS: ReadonlyArray<string> = [
    'organizationIds',
    'countryIds',
    'currencies',
    'companyIds',
    'enterpriseIds',
    'branchIds',
  ];

  public constructor(
    public organizationIds: string[],
    public countryIds: string[],
    public currencies: string[],
    public companyIds: string[],
    public enterpriseIds: string[],
    public branchIds: string[],
  ) {}

  public static empty(): ReportScope {
    return new ReportScope([], [], [], [], [], []);
  }

  public static of(dto: DataScopeDto): ReportScope {
    return new ReportScope(
      [...dto.organizationIds],
      [...dto.countryIds],
      [...dto.currencies],
      [...dto.companyIds],
      [...dto.enterpriseIds],
      [...dto.branchIds],
    );
  }

  public dto(): DataScopeDto {
    return {
      organizationIds: [...this.organizationIds],
      countryIds: [...this.countryIds],
      currencies: [...this.currencies],
      companyIds: [...this.companyIds],
      enterpriseIds: [...this.enterpriseIds],
      branchIds: [...this.branchIds],
    };
  }

  /** Copia con un nivel cambiado. */
  public with(level: OrgLevel | 'CURRENCY', ids: string[]): ReportScope {
    const d: DataScopeDto = this.dto();
    return ReportScope.of({
      organizationIds: level === OrgLevel.ORGANIZATION ? ids : d.organizationIds,
      countryIds: level === OrgLevel.COUNTRY ? ids : d.countryIds,
      currencies: level === 'CURRENCY' ? ids : d.currencies,
      companyIds: level === OrgLevel.COMPANY ? ids : d.companyIds,
      enterpriseIds: level === OrgLevel.ENTERPRISE ? ids : d.enterpriseIds,
      branchIds: level === OrgLevel.BRANCH ? ids : d.branchIds,
    });
  }

  /** `null` si la URL no trae un alcance elegido. */
  public static fromQuery(params: ParamMap): Nullable<ReportScope> {
    if (params.get('scope') !== 'chosen') {
      return null;
    }
    const list = (key: string): string[] =>
      (params.get(key) ?? '')
        .split(',')
        .map((v: string): string => v.trim())
        .filter((v: string): boolean => v.length > 0);
    return new ReportScope(
      list('organizationIds'),
      list('countryIds'),
      list('currencies'),
      list('companyIds'),
      list('enterpriseIds'),
      list('branchIds'),
    );
  }

  public toQuery(): Record<string, string> {
    const lists: ReadonlyArray<ReadonlyArray<string>> = [
      this.organizationIds,
      this.countryIds,
      this.currencies,
      this.companyIds,
      this.enterpriseIds,
      this.branchIds,
    ];
    const query: Record<string, string> = { scope: 'chosen' };
    ReportScope.KEYS.forEach((key: string, i: number): void => {
      const values: ReadonlyArray<string> = lists[i] ?? [];
      if (values.length > 0) {
        query[key] = values.join(',');
      }
    });
    return query;
  }

  /**
   * Unidades de un nivel, en cascada: cada nivel superior con algo elegido (aunque no sea el
   * inmediato) limita las opciones a sus descendientes.
   */
  public options(tree: OrgTree, level: OrgLevel): Option<string>[] {
    return tree.units
      .filter((u: OrgUnitView): boolean => u.s.level === level && this.fitsAncestors(tree, u))
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id }));
  }

  private fitsAncestors(tree: OrgTree, unit: OrgUnitView): boolean {
    const ancestors: Map<OrgLevel, string> = new Map<OrgLevel, string>();
    let parent: Nullable<OrgUnitView> = tree.find(unit.s.parentId);
    while (parent !== null) {
      ancestors.set(parent.s.level, parent.id);
      parent = tree.find(parent.s.parentId);
    }
    for (const [level, id] of ancestors) {
      const chosen: string[] = this.chosenAt(level);
      if (chosen.length > 0 && !chosen.includes(id)) {
        return false;
      }
    }
    return true;
  }

  /** Monedas de los países elegidos (o de todos). */
  public currencyOptions(tree: OrgTree): Option<string>[] {
    const currencies: Set<string> = new Set<string>();
    for (const country of this.options(tree, OrgLevel.COUNTRY)) {
      if (this.countryIds.length === 0 || this.countryIds.includes(country.value)) {
        for (const currency of tree.currencies(country.value)) {
          currencies.add(currency);
        }
      }
    }
    return [...currencies].sort().map((c: string): Option<string> => ({ label: c, value: c }));
  }

  private chosenAt(level: OrgLevel): string[] {
    switch (level) {
      case OrgLevel.ORGANIZATION:
        return this.organizationIds;
      case OrgLevel.COUNTRY:
        return this.countryIds;
      case OrgLevel.COMPANY:
        return this.companyIds;
      case OrgLevel.ENTERPRISE:
        return this.enterpriseIds;
      case OrgLevel.BRANCH:
        return this.branchIds;
    }
  }
}
