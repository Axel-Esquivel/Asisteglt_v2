import { ParamMap } from '@angular/router';
import { OrgLevel } from '@asisteglt/shared-contracts';
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

  /** Unidades de un nivel, en cascada con lo elegido en el nivel superior. */
  public options(tree: OrgTree, level: OrgLevel): Option<string>[] {
    const parents: string[] = this.parentsOf(level);
    return tree.units
      .filter(
        (u: OrgUnitView): boolean =>
          u.s.level === level &&
          (parents.length === 0 || (u.s.parentId !== null && parents.includes(u.s.parentId))),
      )
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id }));
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

  private parentsOf(level: OrgLevel): string[] {
    switch (level) {
      case OrgLevel.ORGANIZATION:
        return [];
      case OrgLevel.COUNTRY:
        return this.organizationIds;
      case OrgLevel.COMPANY:
        return this.countryIds;
      case OrgLevel.ENTERPRISE:
        return this.companyIds;
      case OrgLevel.BRANCH:
        return this.enterpriseIds;
    }
  }
}
