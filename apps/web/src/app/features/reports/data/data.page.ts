import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImportItemStatus, OrgLevel } from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Card } from 'primeng/card';
import { Select } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ProjectContext } from '../../projects/data/project-context';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { DataRow, ImportBatchView, ImportItemView, RecordPage } from '../data/import.model';
import { OrgTree, OrgUnitView } from '../data/org.model';
import { ProfileView } from '../data/profile.model';
import { RecordFilters, ReportsApiClient } from '../data/reports.api-client';
import { Option } from '../data/reports-labels';

/** Datos publicados (versión vigente de cada carga), con los encabezados por su nombre. */
@Component({
  selector: 'app-data-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Card, Select, TableModule],
  templateUrl: './data.page.html',
  styleUrl: '../reports.scss',
})
export class DataPage implements OnInit {
  protected readonly page: WritableSignal<RecordPage> = signal<RecordPage>(new RecordPage(0, []));
  protected readonly loading: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly period: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly profileId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly companyId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly pageSize: number = 50;

  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  private readonly org: WritableSignal<OrgTree> = signal<OrgTree>(OrgTree.empty());
  private readonly profiles: WritableSignal<ProfileView[]> = signal<ProfileView[]>([]);
  private readonly periods: WritableSignal<string[]> = signal<string[]>([]);
  private readonly first: WritableSignal<number> = signal<number>(0);
  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);

  protected readonly periodOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.periods().map((p: string): Option<string> => ({ label: p, value: p })),
  );
  protected readonly profileOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.profiles().map((p: ProfileView): Option<string> => ({ label: p.name, value: p.id })),
  );
  protected readonly companyOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.org()
      .units.filter((u: OrgUnitView): boolean => u.s.level === OrgLevel.COMPANY)
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id })),
  );
  /** Columnas: encabezados presentes en la página, en el orden del catálogo. */
  protected readonly columns: Signal<CatalogFieldView[]> = computed((): CatalogFieldView[] => {
    const present: Set<string> = new Set<string>(
      this.page().rows.flatMap((r: DataRow): string[] => r.keys()),
    );
    return this.catalog().fields.filter((f: CatalogFieldView): boolean => present.has(f.key));
  });

  public ngOnInit(): void {
    this.initialize().catch((): void => {
      // Informado en initialize.
    });
  }

  protected filtersChanged(): void {
    this.first.set(0);
    this.fetch().catch((): void => {
      // Informado en fetch.
    });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    this.first.set(event.first ?? 0);
    this.fetch().catch((): void => {
      // Informado en fetch.
    });
  }

  protected cell(row: DataRow, field: CatalogFieldView): string {
    const value: CellValue = row.value(field.key);
    if (value === null) {
      return '—';
    }
    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }
    return field.isNumeric() ? DataPage.formatNumber(value) : value;
  }

  protected companyName(id: string): string {
    return this.org().nameOf(id);
  }

  private static formatNumber(value: string): string {
    const parts: string[] = value.split('.');
    const integer: string = parts[0] ?? '';
    const fraction: Nullable<string> = parts[1] ?? null;
    const negative: boolean = integer.startsWith('-');
    const digits: string = integer.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}${digits}${fraction === null ? '' : `.${fraction}`}`;
  }

  private async fetch(): Promise<void> {
    this.loading.set(true);
    const filters: RecordFilters = {
      period: this.period(),
      profileId: this.profileId(),
      companyId: this.companyId(),
    };
    const result: Result<RecordPage> = await this.api.records(
      this.context.id(),
      filters,
      Math.floor(this.first() / this.pageSize),
      this.pageSize,
    );
    this.loading.set(false);
    result.match(
      (page: RecordPage): void => this.page.set(page),
      (error): void => this.notifier.error(error),
    );
  }

  private async initialize(): Promise<void> {
    const projectId: string = this.context.id();
    const [catalog, org, profiles, history] = await Promise.all([
      this.api.fieldCatalog(projectId),
      this.api.orgStructure(projectId),
      this.api.profileList(projectId),
      this.api.importHistory(projectId),
    ]);
    catalog.match(
      (c: CatalogView): void => this.catalog.set(c),
      (e): void => this.notifier.error(e),
    );
    org.match(
      (o: OrgTree): void => this.org.set(o),
      (e): void => this.notifier.error(e),
    );
    profiles.match(
      (p: ProfileView[]): void => this.profiles.set(p),
      (e): void => this.notifier.error(e),
    );
    history.match(
      (batches: ImportBatchView[]): void => {
        const periods: Set<string> = new Set<string>(
          batches
            .flatMap((b: ImportBatchView): ImportItemView[] => [...b.items])
            .filter((i: ImportItemView): boolean => i.s.status === ImportItemStatus.PUBLISHED)
            .map((i: ImportItemView): string => i.s.period),
        );
        const sorted: string[] = [...periods].sort().reverse();
        this.periods.set(sorted);
        this.period.set(sorted[0] ?? null);
      },
      (e): void => this.notifier.error(e),
    );
    await this.fetch();
  }
}
