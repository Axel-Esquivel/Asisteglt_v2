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
  ImportItemStatus,
  OrgLevel,
  ProjectPermission,
  FormulaColumnDto,
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
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { ProjectContext } from '../../projects/data/project-context';
import { ClassificationView, ComputedReport, ReportDefinitionView, ReportRow } from '../data/analysis.model';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { ImportBatchView, ImportItemView } from '../data/import.model';
import { OrgTree, OrgUnitView } from '../data/org.model';
import { ProfileView } from '../data/profile.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { FormulaCheck } from '../data/operations.model';
import { Option } from '../data/reports-labels';

/** Columna calculada editable del diseñador. */
export class FormulaColumnDraft {
  public constructor(
    public label: string,
    public formula: string,
  ) {}
}

/** Borrador editable del diseñador (propiedades explícitas, sin opcionales). */
class ReportDraft {
  public constructor(
    public readonly id: Nullable<string>,
    public name: string,
    public rowSource: RowSource,
    public classificationId: Nullable<string>,
    public rowFieldKey: Nullable<string>,
    public measures: string[],
    public profileId: Nullable<string>,
    public companyId: Nullable<string>,
    public onlyWhenFieldKey: Nullable<string>,
    public includeUnclassified: boolean,
    public formulaColumns: FormulaColumnDraft[],
  ) {}

  public static blank(): ReportDraft {
    return new ReportDraft(null, '', RowSource.CLASSIFICATION, null, null, [], null, null, null, true, []);
  }

  public static of(view: ReportDefinitionView): ReportDraft {
    const s: ReportDefinitionRequest = view.spec;
    return new ReportDraft(
      view.id,
      s.name,
      s.rowSource,
      s.classificationId,
      s.rowFieldKey,
      [...s.measures],
      s.profileId,
      s.companyId,
      s.onlyWhenFieldKey,
      s.includeUnclassified,
      s.formulaColumns.map(
        (c: FormulaColumnDto): FormulaColumnDraft => new FormulaColumnDraft(c.label, c.formula),
      ),
    );
  }

  public request(): ReportDefinitionRequest {
    return {
      name: this.name,
      rowSource: this.rowSource,
      classificationId: this.rowSource === RowSource.CLASSIFICATION ? this.classificationId : null,
      rowFieldKey: this.rowSource === RowSource.FIELD ? this.rowFieldKey : null,
      measures: this.measures,
      profileId: this.profileId,
      companyId: this.companyId,
      onlyWhenFieldKey: this.onlyWhenFieldKey,
      includeUnclassified: this.includeUnclassified,
      formulaColumns: this.formulaColumns.map((c: FormulaColumnDraft): FormulaColumnDto => ({
        label: c.label,
        formula: c.formula,
      })),
    };
  }
}

/** Informes matriciales: diseño (filas × medidas) y consulta por período con exportación CSV. */
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
    { label: 'Clasificación', value: RowSource.CLASSIFICATION },
    { label: 'Encabezado', value: RowSource.FIELD },
  ];

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
  protected readonly companyOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.org()
      .units.filter((u: OrgUnitView): boolean => u.s.level === OrgLevel.COMPANY)
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id })),
  );

  protected readonly reportTitle: Signal<string> = computed((): string => {
    const report: Nullable<ComputedReport> = this.report();
    return report === null ? 'Selecciona un informe' : report.name;
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

  protected addFormulaColumn(draft: ReportDraft): void {
    draft.formulaColumns = [...draft.formulaColumns, new FormulaColumnDraft('', '=SUMA()')];
    this.touch();
  }

  protected removeFormulaColumn(draft: ReportDraft, index: number): void {
    draft.formulaColumns = draft.formulaColumns.filter(
      (_c: FormulaColumnDraft, i: number): boolean => i !== index,
    );
    this.touch();
  }

  protected columnCheck(column: FormulaColumnDraft): FormulaCheck {
    return FormulaCheck.of(column.formula, this.catalog(), FormulaContext.AGGREGATE);
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
    this.notifier.success('Informe guardado');
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

  private async load(): Promise<void> {
    const projectId: string = this.context.id();
    const [catalog, classifications, profiles, org, history] = await Promise.all([
      this.api.fieldCatalog(projectId),
      this.api.classificationList(projectId),
      this.api.profileList(projectId),
      this.api.orgStructure(projectId),
      this.api.importHistory(projectId),
      this.loadDefinitions(),
    ]);
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
