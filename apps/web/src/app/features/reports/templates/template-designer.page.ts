import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ChartType,
  ElementKind,
  NegativeStyle,
  NumberScale,
  OrgLevel,
  PageFormatName,
  PageOrientation,
  ProjectPermission,
  TemplateElementDto,
  TemplatePageDto,
  TextAlign,
} from '@asisteglt/shared-contracts';
import { FormulaContext } from '@asisteglt/shared-formula-engine';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Textarea } from 'primeng/textarea';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { ProjectContext } from '../../projects/data/project-context';
import { ReportDefinitionView } from '../data/analysis.model';
import { CatalogView } from '../data/catalog.model';
import { FormulaCheck } from '../data/operations.model';
import { OrgTree, OrgUnitView } from '../data/org.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option } from '../data/reports-labels';
import { NumberFormatter, PageGeometry, TemplateView } from '../data/templates.model';
import { TemplateDesignerStore } from './template-designer.store';

/**
 * Diseñador de plantillas: páginas a escala (3 px por mm), elementos que se arrastran y
 * redimensionan con ajuste a 1 mm, y panel de propiedades de la página o del elemento elegido.
 */
@Component({
  selector: 'app-template-designer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    Button,
    Card,
    FloatLabel,
    InputNumber,
    InputText,
    Message,
    MultiSelect,
    Select,
    TableModule,
    Textarea,
    ToggleSwitch,
  ],
  templateUrl: './template-designer.page.html',
  styleUrls: ['../reports.scss', './template-designer.page.scss'],
  host: {
    '(window:pointermove)': 'onPointerMove($event)',
    '(window:pointerup)': 'onPointerUp()',
  },
})
export class TemplateDesignerPage implements OnInit {
  public readonly templateId = input.required<string>();

  protected readonly store: TemplateDesignerStore = new TemplateDesignerStore();
  protected readonly scale: number = TemplateDesignerStore.SCALE;
  protected readonly kinds: typeof ElementKind = ElementKind;
  protected readonly formats: Option<PageFormatName>[] = PageGeometry.FORMATS;
  protected readonly orientations: Option<PageOrientation>[] = PageGeometry.ORIENTATIONS;
  protected readonly negatives: Option<NegativeStyle>[] = NumberFormatter.NEGATIVES;
  protected readonly scales: Option<NumberScale>[] = NumberFormatter.SCALES;
  protected readonly aligns: Option<TextAlign>[] = [
    { label: 'Izquierda', value: TextAlign.LEFT },
    { label: 'Centro', value: TextAlign.CENTER },
    { label: 'Derecha', value: TextAlign.RIGHT },
  ];
  protected readonly chartTypes: Option<ChartType>[] = [
    { label: 'Barras', value: ChartType.BAR },
    { label: 'Líneas', value: ChartType.LINE },
    { label: 'Circular', value: ChartType.PIE },
  ];
  protected readonly custom: PageFormatName = PageFormatName.CUSTOM;
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly loaded: WritableSignal<boolean> = signal<boolean>(false);

  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  private readonly reports: WritableSignal<ReportDefinitionView[]> = signal<ReportDefinitionView[]>([]);
  private readonly org: WritableSignal<OrgTree> = signal<OrgTree>(OrgTree.empty());
  protected readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);

  protected readonly canDesign: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.REPORTS_DESIGN),
  );
  protected readonly reportOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.reports().map((r: ReportDefinitionView): Option<string> => ({ label: r.name, value: r.id })),
  );
  protected readonly companyOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.org()
      .units.filter((u: OrgUnitView): boolean => u.s.level === OrgLevel.COMPANY)
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id })),
  );
  /** Columnas del informe elegido en el gráfico (medidas y columnas calculadas, en orden). */
  protected readonly columnOptions: Signal<Option<number>[]> = computed((): Option<number>[] => {
    const element: Nullable<TemplateElementDto> = this.store.selected();
    const report: Nullable<ReportDefinitionView> =
      element === null
        ? null
        : (this.reports().find((r: ReportDefinitionView): boolean => r.id === element.reportId) ?? null);
    if (report === null) {
      return [];
    }
    const labels: string[] = [
      ...report.spec.measures.map((key: string): string => this.catalog().labelOf(key)),
      ...report.spec.formulaColumns.map((c): string => c.label),
    ];
    return labels.map((label: string, value: number): Option<number> => ({ label, value }));
  });
  protected readonly formulaCheck: Signal<FormulaCheck> = computed((): FormulaCheck => {
    const element: Nullable<TemplateElementDto> = this.store.selected();
    return element === null || element.kind !== ElementKind.KPI
      ? FormulaCheck.empty()
      : FormulaCheck.of(element.formula ?? '', this.catalog(), FormulaContext.AGGREGATE);
  });

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected kindLabel(kind: ElementKind): string {
    return TemplateDesignerStore.kindLabel(kind);
  }

  protected preview(element: TemplateElementDto): string {
    switch (element.kind) {
      case ElementKind.TEXT:
        return element.text ?? '';
      case ElementKind.KPI:
        return element.formula ?? '';
      case ElementKind.MATRIX:
        return `Tabla: ${this.reportName(element.reportId)}`;
      case ElementKind.CHART:
        return `Gráfico: ${this.reportName(element.reportId)}`;
    }
  }

  protected startDrag(event: PointerEvent, element: TemplateElementDto, resize: boolean): void {
    if (!this.canDesign()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.store.startDrag(element, resize, event.clientX, event.clientY);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.store.isDragging()) {
      this.store.dragTo(event.clientX, event.clientY);
    }
  }

  protected onPointerUp(): void {
    this.store.endDrag();
  }

  protected onElementKey(event: KeyboardEvent, element: TemplateElementDto): void {
    this.store.selectedId.set(element.id);
    const step: number = event.shiftKey ? 10 : 1;
    const moves: ReadonlyMap<string, readonly [number, number]> = new Map<string, readonly [number, number]>([
      ['ArrowLeft', [-step, 0]],
      ['ArrowRight', [step, 0]],
      ['ArrowUp', [0, -step]],
      ['ArrowDown', [0, step]],
    ]);
    const move: Nullable<readonly [number, number]> = moves.get(event.key) ?? null;
    if (move !== null && this.canDesign()) {
      event.preventDefault();
      this.store.nudge(move[0], move[1]);
    }
    if (event.key === 'Delete' && this.canDesign()) {
      this.store.removeSelected();
    }
  }

  protected setPage(change: (page: TemplatePageDto) => TemplatePageDto): void {
    this.store.updatePage(change);
  }

  protected pageFormat(format: PageFormatName): void {
    this.store.updatePage((p: TemplatePageDto): TemplatePageDto => ({ ...p, format }));
  }

  protected pageOrientation(orientation: PageOrientation): void {
    this.store.updatePage((p: TemplatePageDto): TemplatePageDto => ({ ...p, orientation }));
  }

  protected pageNumber(key: 'width' | 'height' | 'margin', value: Nullable<number>): void {
    const v: number = value ?? 0;
    this.store.updatePage((p: TemplatePageDto): TemplatePageDto =>
      key === 'width' ? { ...p, width: v } : key === 'height' ? { ...p, height: v } : { ...p, margin: v },
    );
  }

  protected pageText(key: 'name' | 'header' | 'footer', value: string): void {
    this.store.updatePage((p: TemplatePageDto): TemplatePageDto =>
      key === 'name'
        ? { ...p, name: value }
        : key === 'header'
          ? { ...p, header: value }
          : { ...p, footer: value },
    );
  }

  protected box(key: 'x' | 'y' | 'width' | 'height', value: Nullable<number>): void {
    const v: number = value ?? 0;
    this.store.updateSelected((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      box:
        key === 'x'
          ? { ...e.box, x: v }
          : key === 'y'
            ? { ...e.box, y: v }
            : key === 'width'
              ? { ...e.box, width: v }
              : { ...e.box, height: v },
    }));
  }

  protected element(change: (e: TemplateElementDto) => TemplateElementDto): void {
    this.store.updateSelected(change);
  }

  protected name(value: string): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({ ...e, name: value }));
  }

  protected text(value: string): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({ ...e, text: value }));
  }

  protected formula(value: string): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({ ...e, formula: value }));
  }

  protected report(value: Nullable<string>): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({ ...e, reportId: value, columns: [] }));
  }

  protected company(value: Nullable<string>): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({ ...e, companyId: value }));
  }

  protected chartType(value: ChartType): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({ ...e, chartType: value }));
  }

  protected columns(value: number[]): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({ ...e, columns: value }));
  }

  protected fontSize(value: Nullable<number>): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      style: { ...e.style, fontSize: value ?? 10 },
    }));
  }

  protected bold(value: boolean): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      style: { ...e.style, bold: value },
    }));
  }

  protected align(value: TextAlign): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      style: { ...e.style, align: value },
    }));
  }

  protected decimals(value: Nullable<number>): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      numberFormat: { ...e.numberFormat, decimals: value ?? 0 },
    }));
  }

  protected thousands(value: boolean): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      numberFormat: { ...e.numberFormat, thousands: value },
    }));
  }

  protected negative(value: NegativeStyle): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      numberFormat: { ...e.numberFormat, negative: value },
    }));
  }

  protected numberScale(value: NumberScale): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      numberFormat: { ...e.numberFormat, scale: value },
    }));
  }

  protected affix(key: 'prefix' | 'suffix', value: string): void {
    this.element((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      numberFormat:
        key === 'prefix' ? { ...e.numberFormat, prefix: value } : { ...e.numberFormat, suffix: value },
    }));
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const result: Result<TemplateView> = await this.api.saveTemplate(
      this.context.id(),
      this.templateId(),
      this.store.request(),
    );
    this.saving.set(false);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    const index: number = this.store.pageIndex();
    const selected: Nullable<string> = this.store.selectedId();
    this.store.load(result.unwrap());
    this.store.pageIndex.set(Math.min(index, this.store.pages().length - 1));
    this.store.selectedId.set(selected);
    this.notifier.success('Plantilla guardada');
  }

  private reportName(id: Nullable<string>): string {
    const report: Nullable<ReportDefinitionView> =
      this.reports().find((r: ReportDefinitionView): boolean => r.id === id) ?? null;
    return report === null ? 'sin informe' : report.name;
  }

  private async load(): Promise<void> {
    const projectId: string = this.context.id();
    const [template, catalog, reports, org] = await Promise.all([
      this.api.template(projectId, this.templateId()),
      this.api.fieldCatalog(projectId),
      this.api.reportList(projectId),
      this.api.orgStructure(projectId),
    ]);
    catalog.match(
      (c: CatalogView): void => this.catalog.set(c),
      (e): void => this.notifier.error(e),
    );
    reports.match(
      (items: ReportDefinitionView[]): void => this.reports.set(items),
      (e): void => this.notifier.error(e),
    );
    org.match(
      (tree: OrgTree): void => this.org.set(tree),
      (e): void => this.notifier.error(e),
    );
    template.match(
      (view: TemplateView): void => {
        this.store.load(view);
        this.loaded.set(true);
      },
      (e): void => this.notifier.error(e),
    );
  }
}
