import { OrgLevel, OrgUnitResponse } from '@asisteglt/shared-contracts';
import { FieldDecoder, FieldReader, Nullable } from '@asisteglt/shared-kernel';
import { ReportsLabels } from './reports-labels';

export class OrgUnitView {
  public constructor(public readonly s: OrgUnitResponse) {}

  public static decoder(): FieldDecoder<OrgUnitView> {
    return new FieldDecoder<OrgUnitView>(
      (f: FieldReader): OrgUnitView =>
        new OrgUnitView({
          id: f.string('id'),
          level: f.oneOf('level', Object.values(OrgLevel)),
          parentId: f.nullableString('parentId'),
          code: f.string('code'),
          name: f.string('name'),
          currencies: f.stringList('currencies'),
        }),
    );
  }

  public get id(): string {
    return this.s.id;
  }

  public label(): string {
    return `${this.s.name} (${this.s.code})`;
  }

  public levelLabel(): string {
    return ReportsLabels.label(ReportsLabels.LEVELS, this.s.level);
  }
}

/** Árbol de la estructura organizacional con consultas en cascada para los selectores. */
export class OrgTree {
  public constructor(public readonly units: ReadonlyArray<OrgUnitView>) {}

  public static empty(): OrgTree {
    return new OrgTree([]);
  }

  public static decoder(): FieldDecoder<OrgTree> {
    return new FieldDecoder<OrgTree>(
      (f: FieldReader): OrgTree => new OrgTree(f.list('units', OrgUnitView.decoder())),
    );
  }

  public find(id: Nullable<string>): Nullable<OrgUnitView> {
    return id === null ? null : (this.units.find((u: OrgUnitView): boolean => u.id === id) ?? null);
  }

  public children(parentId: Nullable<string>, level: OrgLevel): OrgUnitView[] {
    return this.units.filter((u: OrgUnitView): boolean => u.s.parentId === parentId && u.s.level === level);
  }

  public currencies(countryId: Nullable<string>): string[] {
    const country: Nullable<OrgUnitView> = this.find(countryId);
    return country === null ? [] : [...country.s.currencies];
  }

  public nameOf(id: Nullable<string>): string {
    const unit: Nullable<OrgUnitView> = this.find(id);
    return unit === null ? '—' : unit.s.name;
  }
}
