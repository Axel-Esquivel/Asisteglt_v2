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
import {
  Aggregation,
  CollectionFieldDto,
  DataColumnDto,
  DataColumnKind,
  ImportItemStatus,
  OrgLevel,
  PeriodGrouping,
  PeriodValue,
  PresentationCurrencyDto,
  ProjectPermission,
  RateQuote,
  ReportDefinitionRequest,
  RowSource,
} from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { FormulaContext } from '@asisteglt/shared-formula-engine';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { Fieldset } from 'primeng/fieldset';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { ProjectContext } from '../../projects/data/project-context';
import {
  ClassificationView,
  ComputedReport,
  HeaderCell,
  ReportColumn,
  ReportDefinitionView,
  ReportRow,
} from '../data/analysis.model';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { ImportBatchView, ImportItemView } from '../data/import.model';
import { OrgTree, OrgUnitView } from '../data/org.model';
import { ProfileView } from '../data/profile.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { CollectionView } from '../data/collections.model';
import { FormulaCheck, OperationsView } from '../data/operations.model';
import { Option, ReportsLabels } from '../data/reports-labels';

/** Columna de valores editable: un dato (encabezado) o una columna calculada. */
export class ColumnDraft {
  public constructor(
    public kind: DataColumnKind,
    public label: string,
    public fieldKey: Nullable<string>,
    public formula: string,
    public periodValue: PeriodValue,
    public previous: boolean,
  ) {}

  public static of(dto: DataColumnDto): ColumnDraft {
    return new ColumnDraft(
      dto.kind,
      dto.label,
      dto.fieldKey,
      dto.formula ?? '',
      dto.periodValue,
      dto.periodOffset < 0,
    );
  }

  public isFormula(): boolean {
    return this.kind === DataColumnKind.FORMULA;
  }

  public dto(): DataColumnDto {
    const formula: boolean = this.isFormula();
    return {
      kind: this.kind,
      label: this.label,
      fieldKey: formula ? null : this.fieldKey,
      formula: formula ? this.formula : null,
      periodValue: this.periodValue,
      periodOffset: this.previous ? -1 : 0,
    };
  }
}

/** Borrador editable de una tabla de datos (propiedades explícitas, sin opcionales). */
class ReportDraft {
  public constructor(
    public readonly id: Nullable<string>,
    public name: string,
    public rowSource: RowSource,
    public classificationId: Nullable<string>,
    public rowFieldKey: Nullable<string>,
    public classificationColumns: string[],
    public columns: ColumnDraft[],
    public profileId: Nullable<string>,
    public organizationIds: string[],
    public countryIds: string[],
    public currencies: string[],
    public companyIds: string[],
    public enterpriseIds: string[],
    public branchIds: string[],
    public periodGrouping: PeriodGrouping,
    public columnSplit: OrgLevel[],
    public subtotals: boolean,
    public onlyWhenFieldKey: Nullable<string>,
    public includeUnclassified: boolean,
    /** Convertir los montos a una moneda de presentación. */
    public convert: boolean,
    public targetCurrency: string,
    public collectionId: Nullable<string>,
    public rateFieldKey: Nullable<string>,
    public currencyFieldKey: Nullable<string>,
    public quote: RateQuote,
  ) {}

  public static blank(): ReportDraft {
    return new ReportDraft(
      null,
      '',
      RowSource.FIELD,
      null,
      null,
      [],
      [],
      null,
      [],
      [],
      [],
      [],
      [],
      [],
      PeriodGrouping.MONTH,
      [],
      true,
      null,
      true,
      false,
      '',
      null,
      null,
      null,
      RateQuote.UNITS_PER_TARGET,
    );
  }

  public static of(view: ReportDefinitionView): ReportDraft {
    const s: ReportDefinitionRequest = view.spec;
    return new ReportDraft(
      view.id,
      s.name,
      s.rowSource,
      s.classificationId,
      s.rowFieldKey,
      [...s.classificationColumns],
      s.columns.map((c: DataColumnDto): ColumnDraft => ColumnDraft.of(c)),
      s.profileId,
      [...s.scope.organizationIds],
      [...s.scope.countryIds],
      [...s.scope.currencies],
      [...s.scope.companyIds],
      [...s.scope.enterpriseIds],
      [...s.scope.branchIds],
      s.periodGrouping,
      [...s.columnSplit],
      s.subtotals,
      s.onlyWhenFieldKey,
      s.includeUnclassified,
      s.presentation !== null,
      s.presentation === null ? '' : s.presentation.targetCurrency,
      s.presentation === null ? null : s.presentation.collectionId,
      s.presentation === null ? null : s.presentation.rateFieldKey,
      s.presentation === null ? null : s.presentation.currencyFieldKey,
      s.presentation === null ? RateQuote.UNITS_PER_TARGET : s.presentation.quote,
    );
  }

  public request(): ReportDefinitionRequest {
    return {
      name: this.name,
      rowSource: this.rowSource,
      classificationId: this.rowSource === RowSource.CLASSIFICATION ? this.classificationId : null,
      rowFieldKey: this.rowSource === RowSource.FIELD ? this.rowFieldKey : null,
      classificationColumns: this.rowSource === RowSource.FIELD ? this.classificationColumns : [],
      columns: this.columns.map((c: ColumnDraft): DataColumnDto => c.dto()),
      profileId: this.profileId,
      scope: {
        organizationIds: this.organizationIds,
        countryIds: this.countryIds,
        currencies: this.currencies,
        companyIds: this.companyIds,
        enterpriseIds: this.enterpriseIds,
        branchIds: this.branchIds,
      },
      periodGrouping: this.periodGrouping,
      columnSplit: this.columnSplit,
      subtotals: this.subtotals,
      onlyWhenFieldKey: this.onlyWhenFieldKey,
      includeUnclassified: this.includeUnclassified,
      presentation: this.presentation(),
    };
  }

  /** Lo incompleto viaja vacío para que la API explique qué falta. */
  private presentation(): Nullable<PresentationCurrencyDto> {
    return this.convert
      ? {
          targetCurrency: this.targetCurrency.trim().toUpperCase(),
          collectionId: this.collectionId ?? '',
          rateFieldKey: this.rateFieldKey ?? '',
          currencyFieldKey: this.currencyFieldKey ?? '',
          quote: this.quote,
        }
      : null;
  }
}

/**
 * Tablas de datos: arman los datos que usan las plantillas (origen, alcance de una o varias
 * compañías, período agrupado, filas y columnas en orden) y se consultan por período con CSV.
 */
@Component({
  selector: 'app-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Button,
    Card,
    Checkbox,
    DatePicker,
    Dialog,
    Fieldset,
    FloatLabel,
    InputText,
    Message,
    MultiSelect,
    Select,
    SelectButton,
    TableModule,
  ],
  templateUrl: './reports.page.html',
  styleUrl: '../reports.scss',
})
export class ReportsPage implements OnInit {
  protected readonly definitions: WritableSignal<ReportDefinitionView[]> = signal<ReportDefinitionView[]>([]);
  protected readonly selectedId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly period: WritableSignal<Date> = signal<Date>(new Date());
  protected readonly report: WritableSignal<Nullable<ComputedReport>> =
    signal<Nullable<ComputedReport>>(null);
  protected readonly running: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly draft: WritableSignal<Nullable<ReportDraft>> = signal<Nullable<ReportDraft>>(null);
  protected readonly revision: WritableSignal<number> = signal<number>(0);
  protected readonly RowSource: typeof RowSource = RowSource;
  protected readonly sourceOptions: Option<RowSource>[] = [
    { label: 'Por identificador', value: RowSource.FIELD },
    { label: 'Por clasificación', value: RowSource.CLASSIFICATION },
  ];
  protected readonly groupingOptions: Option<PeriodGrouping>[] = ReportsLabels.PERIOD_GROUPINGS;
  protected readonly periodValueOptions: Option<PeriodValue>[] = ReportsLabels.PERIOD_VALUES;
  protected readonly splitOptions: Option<OrgLevel>[] = ReportsLabels.LEVELS;

  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  private readonly classifications: WritableSignal<ClassificationView[]> = signal<ClassificationView[]>([]);
  private readonly profiles: WritableSignal<ProfileView[]> = signal<ProfileView[]>([]);
  private readonly org: WritableSignal<OrgTree> = signal<OrgTree>(OrgTree.empty());
  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);

  protected readonly canDesign: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.REPORTS_DESIGN),
  );
  protected readonly measureOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .active()
      .filter((f: CatalogFieldView): boolean => f.isAggregatable())
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly groupOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .active()
      .filter((f: CatalogFieldView): boolean => f.isGroupable())
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly flagOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .active()
      .filter((f: CatalogFieldView): boolean => f.isBoolean())
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly classificationOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.classifications().map((c: ClassificationView): Option<string> => ({ label: c.name, value: c.id })),
  );
  protected readonly profileOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.profiles().map((p: ProfileView): Option<string> => ({ label: p.name, value: p.id })),
  );
  protected readonly organizationOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.unitOptions(OrgLevel.ORGANIZATION, (): string[] => []),
  );
  protected readonly countryOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.unitOptions(OrgLevel.COUNTRY, (d: ReportDraft): string[] => d.organizationIds),
  );
  protected readonly companyOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.unitOptions(OrgLevel.COMPANY, (d: ReportDraft): string[] => d.countryIds),
  );
  protected readonly enterpriseOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.unitOptions(OrgLevel.ENTERPRISE, (d: ReportDraft): string[] => d.companyIds),
  );
  protected readonly branchOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.unitOptions(OrgLevel.BRANCH, (d: ReportDraft): string[] => d.enterpriseIds),
  );
  protected readonly currencyOptions: Signal<Option<string>[]> = computed((): Option<string>[] => {
    this.revision();
    const draft: Nullable<ReportDraft> = this.draft();
    const countries: Option<string>[] = this.countryOptions();
    const chosen: string[] = draft === null ? [] : draft.countryIds;
    const currencies: Set<string> = new Set<string>();
    for (const country of countries) {
      if (chosen.length === 0 || chosen.includes(country.value)) {
        for (const currency of this.org().currencies(country.value)) {
          currencies.add(currency);
        }
      }
    }
    return [...currencies].sort().map((c: string): Option<string> => ({ label: c, value: c }));
  });

  protected readonly collections: WritableSignal<CollectionView[]> = signal<CollectionView[]>([]);
  protected readonly collectionOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.collections().map((c: CollectionView): Option<string> => ({ label: c.name, value: c.id })),
  );
  protected readonly quotes: Option<RateQuote>[] = OperationsView.QUOTES;

  protected readonly reportTitle: Signal<string> = computed((): string => {
    const report: Nullable<ComputedReport> = this.report();
    return report === null ? 'Selecciona una tabla de datos' : report.name;
  });

  protected readonly selectedItem: Signal<Nullable<ReportDefinitionView>> = computed(
    (): Nullable<ReportDefinitionView> =>
      this.definitions().find((item: ReportDefinitionView): boolean => item.id === this.selectedId()) ?? null,
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected addMeasure(draft: ReportDraft): void {
    draft.columns = [
      ...draft.columns,
      new ColumnDraft(DataColumnKind.MEASURE, '', null, '', PeriodValue.ACCUMULATED, false),
    ];
    this.touch();
  }

  protected addFormulaColumn(draft: ReportDraft): void {
    draft.columns = [
      ...draft.columns,
      new ColumnDraft(DataColumnKind.FORMULA, '', null, '=SUMA()', PeriodValue.ACCUMULATED, false),
    ];
    this.touch();
  }

  protected removeColumn(draft: ReportDraft, index: number): void {
    draft.columns = draft.columns.filter((_c: ColumnDraft, i: number): boolean => i !== index);
    this.touch();
  }

  /** Mueve una columna una posición (−1 a la izquierda, +1 a la derecha). */
  protected moveColumn(draft: ReportDraft, index: number, step: number): void {
    const target: number = index + step;
    const moved: Nullable<ColumnDraft> = draft.columns[index] ?? null;
    if (moved === null || target < 0 || target >= draft.columns.length) {
      return;
    }
    const columns: ColumnDraft[] = draft.columns.filter((_c: ColumnDraft, i: number): boolean => i !== index);
    columns.splice(target, 0, moved);
    draft.columns = columns;
    this.touch();
  }

  /** Al elegir el encabezado se propone cómo tomar los meses: los saldos (último), al cierre. */
  protected changeField(column: ColumnDraft, key: Nullable<string>): void {
    column.fieldKey = key;
    const field: Nullable<CatalogFieldView> = key === null ? null : this.catalog().find(key);
    if (field !== null) {
      column.periodValue =
        field.raw().aggregation === Aggregation.LAST ? PeriodValue.CLOSING : PeriodValue.ACCUMULATED;
    }
    this.touch();
  }

  protected columnCheck(column: ColumnDraft): FormulaCheck {
    return FormulaCheck.of(column.formula, this.catalog(), FormulaContext.AGGREGATE);
  }

  protected headerRows(report: ComputedReport): HeaderCell[][] {
    return report.headerRows();
  }

  protected isSubtotal(report: ComputedReport, index: number): boolean {
    const column: Nullable<ReportColumn> = report.columns[index] ?? null;
    return column !== null && column.subtotal;
  }

  protected touch(): void {
    this.revision.update((n: number): number => n + 1);
  }

  protected openNew(): void {
    this.draft.set(ReportDraft.blank());
  }

  protected openEdit(): void {
    const current: Nullable<ReportDefinitionView> =
      this.definitions().find((d: ReportDefinitionView): boolean => d.id === this.selectedId()) ?? null;
    if (current !== null) {
      this.draft.set(ReportDraft.of(current));
    }
  }

  protected async saveDraft(): Promise<void> {
    const draft: Nullable<ReportDraft> = this.draft();
    if (draft === null) {
      return;
    }
    const result: Result<ReportDefinitionView> = await this.api.saveReport(
      this.context.id(),
      draft.id,
      draft.request(),
    );
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.draft.set(null);
    this.notifier.success('Tabla de datos guardada');
    await this.loadDefinitions();
    this.selectedId.set(result.unwrap().id);
    await this.run();
  }

  protected async select(id: Nullable<string>): Promise<void> {
    this.selectedId.set(id);
    this.report.set(null);
    await this.run();
  }

  protected async changePeriod(date: Nullable<Date>): Promise<void> {
    if (date !== null) {
      this.period.set(date);
      await this.run();
    }
  }

  protected indent(row: ReportRow): string {
    return `${String(row.level * 1.25)}rem`;
  }

  protected format(value: Nullable<string>): string {
    if (value === null) {
      return '—';
    }
    const parts: string[] = value.split('.');
    const integer: string = parts[0] ?? '';
    const fraction: Nullable<string> = parts[1] ?? null;
    const negative: boolean = integer.startsWith('-');
    const digits: string = integer.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decimals: string =
      fraction === null
        ? '.00'
        : `.${fraction.padEnd(2, '0').slice(0, Math.max(2, Math.min(fraction.length, 4)))}`;
    return `${negative ? '-' : ''}${digits}${decimals}`;
  }

  protected exportCsv(): void {
    const report: Nullable<ComputedReport> = this.report();
    if (report === null) {
      return;
    }
    const blob: Blob = new Blob([`\uFEFF${report.toCsv()}`], { type: 'text/csv;charset=utf-8' });
    const url: string = URL.createObjectURL(blob);
    const link: HTMLAnchorElement = document.createElement('a');
    link.href = url;
    link.download = `${report.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}_${report.period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Unidades de un nivel; si se eligieron unidades del nivel superior, solo sus hijas. */
  private unitOptions(level: OrgLevel, parents: (draft: ReportDraft) => string[]): Option<string>[] {
    this.revision();
    const draft: Nullable<ReportDraft> = this.draft();
    const chosen: string[] = draft === null ? [] : parents(draft);
    return this.org()
      .units.filter(
        (u: OrgUnitView): boolean =>
          u.s.level === level &&
          (chosen.length === 0 || (u.s.parentId !== null && chosen.includes(u.s.parentId))),
      )
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id }));
  }

  private periodText(): string {
    const date: Date = this.period();
    return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private async run(): Promise<void> {
    const id: Nullable<string> = this.selectedId();
    if (id === null) {
      return;
    }
    this.running.set(true);
    const result: Result<ComputedReport> = await this.api.runReport(this.context.id(), id, this.periodText());
    this.running.set(false);
    result.match(
      (report: ComputedReport): void => this.report.set(report),
      (error): void => this.notifier.error(error),
    );
  }

  private async loadDefinitions(): Promise<void> {
    const result: Result<ReportDefinitionView[]> = await this.api.reportList(this.context.id());
    result.match(
      (items: ReportDefinitionView[]): void => this.definitions.set(items),
      (e): void => this.notifier.error(e),
    );
  }

  protected rateFieldOptions(collectionId: Nullable<string>): Option<string>[] {
    const collection: Nullable<CollectionView> = this.collection(collectionId);
    return collection === null
      ? []
      : collection
          .rateFields()
          .map((f: CollectionFieldDto): Option<string> => ({ label: f.label, value: f.key }));
  }

  protected currencyFieldOptions(collectionId: Nullable<string>): Option<string>[] {
    const collection: Nullable<CollectionView> = this.collection(collectionId);
    return collection === null
      ? []
      : collection
          .textFields()
          .map((f: CollectionFieldDto): Option<string> => ({ label: f.label, value: f.key }));
  }

  private collection(id: Nullable<string>): Nullable<CollectionView> {
    return this.collections().find((c: CollectionView): boolean => c.id === id) ?? null;
  }

  private async load(): Promise<void> {
    const projectId: string = this.context.id();
    const [catalog, classifications, profiles, org, history, collections] = await Promise.all([
      this.api.fieldCatalog(projectId),
      this.api.classificationList(projectId),
      this.api.profileList(projectId),
      this.api.orgStructure(projectId),
      this.api.importHistory(projectId),
      this.api.collections(projectId),
      this.loadDefinitions(),
    ]);
    collections.match(
      (items: CollectionView[]): void => this.collections.set(items),
      (): void => {
        // Sin colecciones visibles: la moneda de presentación no ofrece tasas.
      },
    );
    catalog.match(
      (c: CatalogView): void => this.catalog.set(c),
      (e): void => this.notifier.error(e),
    );
    classifications.match(
      (c: ClassificationView[]): void => this.classifications.set(c),
      (e): void => this.notifier.error(e),
    );
    profiles.match(
      (p: ProfileView[]): void => this.profiles.set(p),
      (e): void => this.notifier.error(e),
    );
    org.match(
      (o: OrgTree): void => this.org.set(o),
      (e): void => this.notifier.error(e),
    );
    history.match(
      (batches: ImportBatchView[]): void => {
        const latest: Nullable<string> =
          batches
            .flatMap((b: ImportBatchView): ImportItemView[] => [...b.items])
            .filter((i: ImportItemView): boolean => i.s.status === ImportItemStatus.PUBLISHED)
            .map((i: ImportItemView): string => i.s.period)
            .sort()
            .reverse()[0] ?? null;
        if (latest !== null) {
          this.period.set(new Date(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 1, 1));
        }
      },
      (): void => {
        // Sin permiso de ver las cargas: se usa el mes actual.
      },
    );
  }
}
