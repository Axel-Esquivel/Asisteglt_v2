import { ImportItemRequest, OrgLevel } from '@asisteglt/shared-contracts';
import {
  CrossingDetector,
  DividerCrossing,
  FixedWidthReader,
  LineClassification,
  LineStatus,
  ReadSummary,
  TextDocument,
  TextEncoding,
  TextLine,
} from '@asisteglt/shared-ingestion-core';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { CatalogView } from '../data/catalog.model';
import { OrgTree, OrgUnitView } from '../data/org.model';
import { ProfileView } from '../data/profile.model';

export enum RowState {
  READY = 'READY',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export class RowCheck {
  public constructor(
    public readonly state: RowState,
    public readonly message: string,
  ) {}

  public severity(): 'success' | 'warn' | 'danger' {
    return this.state === RowState.READY ? 'success' : this.state === RowState.WARNING ? 'warn' : 'danger';
  }

  public label(): string {
    return this.state === RowState.READY
      ? 'Lista'
      : this.state === RowState.WARNING
        ? 'Revisar'
        : 'Incompleta';
  }
}

/** Fila de la ventana de carga múltiple: un archivo con sus propiedades (docs/12 §4.2). */
export class UploadRow {
  private static sequence: number = 0;

  public readonly id: number;
  public selected: boolean = false;
  public profileId: Nullable<string> = null;
  public period: Nullable<Date> = null;
  public organizationId: Nullable<string> = null;
  public countryId: Nullable<string> = null;
  public currency: Nullable<string> = null;
  public companyId: Nullable<string> = null;
  public enterpriseId: Nullable<string> = null;
  public branchId: Nullable<string> = null;
  public quickCheck: Nullable<RowCheck> = null;

  public constructor(public readonly file: File) {
    UploadRow.sequence += 1;
    this.id = UploadRow.sequence;
  }

  /** Completa lo que se puede deducir: preconfiguración por extensión/patrón, período por nombre y únicos de la estructura. */
  public autofill(profiles: ReadonlyArray<ProfileView>, org: OrgTree): void {
    const accepting: ProfileView[] = profiles.filter(
      (p: ProfileView): boolean => p.isActive() && p.accepts(this.file.name),
    );
    const byPattern: ProfileView[] = accepting.filter((p: ProfileView): boolean =>
      p.matchesPattern(this.file.name),
    );
    const chosen: Nullable<ProfileView> =
      accepting.length === 1
        ? (accepting[0] ?? null)
        : byPattern.length === 1
          ? (byPattern[0] ?? null)
          : null;
    this.profileId = chosen === null ? null : chosen.id;
    const match: Nullable<RegExpExecArray> = /(20\d{2})[-_.]?(0[1-9]|1[0-2])(?!\d)/.exec(this.file.name);
    this.period = match === null ? null : new Date(Number(match[1] ?? '0'), Number(match[2] ?? '1') - 1, 1);
    this.organizationId = UploadRow.single(org.children(null, OrgLevel.ORGANIZATION));
    this.cascade(org);
  }

  /** Limpia o completa los niveles inferiores al cambiar uno superior (selectores en cascada). */
  public cascade(org: OrgTree): void {
    const countries: OrgUnitView[] = org.children(this.organizationId, OrgLevel.COUNTRY);
    if (!countries.some((u: OrgUnitView): boolean => u.id === this.countryId)) {
      this.countryId = UploadRow.single(countries);
    }
    const currencies: string[] = org.currencies(this.countryId);
    if (this.currency === null || !currencies.includes(this.currency)) {
      this.currency = currencies.length === 1 ? (currencies[0] ?? null) : null;
    }
    const companies: OrgUnitView[] = org.children(this.countryId, OrgLevel.COMPANY);
    if (!companies.some((u: OrgUnitView): boolean => u.id === this.companyId)) {
      this.companyId = UploadRow.single(companies);
    }
    const enterprises: OrgUnitView[] = org.children(this.companyId, OrgLevel.ENTERPRISE);
    if (!enterprises.some((u: OrgUnitView): boolean => u.id === this.enterpriseId)) {
      this.enterpriseId = null;
    }
    const branches: OrgUnitView[] = org.children(this.enterpriseId, OrgLevel.BRANCH);
    if (!branches.some((u: OrgUnitView): boolean => u.id === this.branchId)) {
      this.branchId = null;
    }
  }

  public copyFrom(other: UploadRow): void {
    this.profileId = other.profileId;
    this.period = other.period;
    this.organizationId = other.organizationId;
    this.countryId = other.countryId;
    this.currency = other.currency;
    this.companyId = other.companyId;
    this.enterpriseId = other.enterpriseId;
    this.branchId = other.branchId;
  }

  public periodText(): Nullable<string> {
    return this.period === null
      ? null
      : `${String(this.period.getFullYear())}-${String(this.period.getMonth() + 1).padStart(2, '0')}`;
  }

  public scopeKey(): string {
    return [
      this.profileId,
      this.periodText(),
      this.organizationId,
      this.countryId,
      this.currency,
      this.companyId,
      this.enterpriseId,
      this.branchId,
    ].join('|');
  }

  public missing(): string[] {
    const missing: string[] = [];
    const check = (value: Nullable<unknown>, label: string): void => {
      if (value === null) {
        missing.push(label);
      }
    };
    check(this.profileId, 'preconfiguración');
    check(this.period, 'período');
    check(this.organizationId, 'organización');
    check(this.countryId, 'país');
    check(this.currency, 'moneda');
    check(this.companyId, 'compañía');
    return missing;
  }

  public request(): Nullable<ImportItemRequest> {
    const period: Nullable<string> = this.periodText();
    if (
      this.profileId === null ||
      period === null ||
      this.organizationId === null ||
      this.countryId === null ||
      this.currency === null ||
      this.companyId === null
    ) {
      return null;
    }
    return {
      fileName: this.file.name,
      profileId: this.profileId,
      period,
      organizationId: this.organizationId,
      countryId: this.countryId,
      currency: this.currency,
      companyId: this.companyId,
      enterpriseId: this.enterpriseId,
      branchId: this.branchId,
    };
  }

  /** Verificación rápida en el navegador: aplica la preconfiguración a las primeras 500 líneas. */
  public async verify(profile: ProfileView, catalog: CatalogView): Promise<void> {
    const reader: Result<FixedWidthReader> = FixedWidthReader.create(profile.spec, catalog.labels());
    if (!reader.isOk()) {
      this.quickCheck = new RowCheck(RowState.ERROR, 'La preconfiguración no es válida');
      return;
    }
    const bytes: Uint8Array = new Uint8Array(await this.file.slice(0, 512 * 1024).arrayBuffer());
    const encoding: TextEncoding =
      profile.spec.encoding === TextEncoding.UTF8 || profile.spec.encoding === TextEncoding.WINDOWS_1252
        ? profile.spec.encoding
        : TextDocument.detectEncoding(bytes);
    const lines: ReadonlyArray<TextLine> = TextDocument.decode(bytes, encoding, profile.spec.tabSize)
      .head(500)
      .all();
    const classified: LineClassification[] = reader.unwrap().classifyAll(lines);
    const summary: ReadSummary = FixedWidthReader.summarize(classified);
    const candidates: TextLine[] = lines.filter((_l: TextLine, i: number): boolean => {
      const item: Nullable<LineClassification> = classified[i] ?? null;
      return item !== null && item.status() !== LineStatus.IGNORED;
    });
    const crossings: DividerCrossing[] = new CrossingDetector().detect(
      candidates,
      reader.unwrap().getLayout(),
    );
    if (summary.data === 0) {
      this.quickCheck = new RowCheck(
        RowState.WARNING,
        'No se reconocieron líneas de datos con esta preconfiguración',
      );
    } else if (summary.rejectedRatio() > 0.2 || crossings.length > 0) {
      this.quickCheck = new RowCheck(
        RowState.WARNING,
        `${String(summary.rejected)} líneas rechazadas o divisorias que cortan valores en la muestra`,
      );
    } else {
      this.quickCheck = new RowCheck(RowState.READY, `${String(summary.data)} líneas de datos en la muestra`);
    }
  }

  private static single(units: ReadonlyArray<OrgUnitView>): Nullable<string> {
    const first: Nullable<OrgUnitView> = units[0] ?? null;
    return units.length === 1 && first !== null ? first.id : null;
  }
}
