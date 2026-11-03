import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  WritableSignal,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ChartType,
  ElementKind,
  NumberFormatDto,
  TemplateElementDto,
  TemplatePageDto,
  TextAlign,
} from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { ChartData, ChartOptions } from 'chart.js';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { DatePicker } from 'primeng/datepicker';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { ReportRow } from '../data/analysis.model';
import { ImportBatchView } from '../data/import.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { ReportScope } from '../data/report-scope.model';
import {
  ChartSeries,
  FormattedNumber,
  NumberFormatter,
  PageGeometry,
  RenderedElement,
  RenderedPage,
  RenderedTemplate,
  TemplateView,
} from '../data/templates.model';

/** Una página lista para pintar: geometría, diseño de sus elementos y valores calculados. */
class PrintSheet {
  public constructor(
    public readonly page: TemplatePageDto,
    public readonly geometry: PageGeometry,
    public readonly rendered: Nullable<RenderedPage>,
  ) {}

  public valueOf(element: TemplateElementDto): Nullable<RenderedElement> {
    return this.rendered === null ? null : this.rendered.element(element.id);
  }
}

/**
 * Vista de impresión de una plantilla: cada página a su tamaño real (mm) con `@page` por página,
 * para imprimir o «Guardar como PDF» desde el navegador.
 */
@Component({
  selector: 'app-template-print-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Button, UIChart, DatePicker, Message, ProgressSpinner, TableModule],
  templateUrl: './template-print.page.html',
  styleUrl: './template-print.page.scss',
})
export class TemplatePrintPage implements OnInit, OnDestroy {
  public readonly projectId = input.required<string>();
  public readonly templateId = input.required<string>();

  protected readonly sheets: WritableSignal<PrintSheet[]> = signal<PrintSheet[]>([]);
  protected readonly name: WritableSignal<string> = signal<string>('');
  protected readonly month: WritableSignal<Date> = signal<Date>(new Date());
  protected readonly loading: WritableSignal<boolean> = signal<boolean>(true);
  protected readonly error: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly kinds: typeof ElementKind = ElementKind;
  /** Alcance con el que se generó (lo muestra la barra). */
  protected readonly scopeLabel: WritableSignal<string> = signal<string>('');
  /** Se abrió desde Informes: «Volver» regresa ahí y conserva el alcance elegido. */
  protected readonly fromIssued: WritableSignal<boolean> = signal<boolean>(false);
  private scope: Nullable<ReportScope> = null;

  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly router: Router = inject(Router);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly document: Document = inject(DOCUMENT);
  private readonly pageStyles: HTMLStyleElement = this.document.createElement('style');
  private readonly charts: Map<string, ChartData> = new Map<string, ChartData>();
  protected readonly chartOptions: ChartOptions = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
  };

  public ngOnInit(): void {
    const requested: Nullable<Date> = ImportBatchView.monthOf(
      this.route.snapshot.queryParamMap.get('period') ?? '',
    );
    if (requested !== null) {
      this.month.set(requested);
    }
    this.scope = ReportScope.fromQuery(this.route.snapshot.queryParamMap);
    this.fromIssued.set(this.route.snapshot.queryParamMap.get('from') === 'informes');
    this.document.head.appendChild(this.pageStyles);
    this.start(requested !== null).catch((): void => {
      this.error.set('No se pudo calcular la plantilla');
    });
  }

  /** Sin período en la dirección se abre el último mes con datos publicados (no el mes actual). */
  private async start(hasPeriod: boolean): Promise<void> {
    if (!hasPeriod) {
      (await this.api.importHistory(this.projectId())).match(
        (batches: ImportBatchView[]): void => {
          const latest: Nullable<Date> = ImportBatchView.monthOf(
            ImportBatchView.latestPublishedPeriod(batches) ?? '',
          );
          if (latest !== null) {
            this.month.set(latest);
          }
        },
        (): void => {
          // Sin permiso de ver las cargas: se usa el mes actual.
        },
      );
    }
    await this.load();
  }

  public ngOnDestroy(): void {
    this.pageStyles.remove();
  }

  protected async changeMonth(date: Nullable<Date>): Promise<void> {
    if (date === null) {
      return;
    }
    this.month.set(date);
    await this.router.navigate([], {
      queryParams: { period: this.periodText() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    await this.load();
  }

  /** Al volver a Informes conserva la plantilla, el período y el alcance elegidos. */
  protected backQuery(): Record<string, string> {
    return this.fromIssued()
      ? {
          template: this.templateId(),
          period: this.periodText(),
          ...(this.scope === null ? {} : this.scope.toQuery()),
        }
      : {};
  }

  protected print(): void {
    const view: Nullable<Window> = this.document.defaultView;
    if (view !== null) {
      view.print();
    }
  }

  protected pageName(page: TemplatePageDto): string {
    return `tpl-${page.id.replace(/[^A-Za-z0-9_-]/g, '')}`;
  }

  protected align(element: TemplateElementDto): string {
    return element.style.align === TextAlign.CENTER
      ? 'center'
      : element.style.align === TextAlign.RIGHT
        ? 'right'
        : 'left';
  }

  /** Las tablas dinámicas se muestran como las tablas de datos. */
  protected renderKind(element: TemplateElementDto): ElementKind {
    return element.kind === ElementKind.PIVOT ? ElementKind.MATRIX : element.kind;
  }

  /** Rótulo de un valor filtrado con el número ya formateado en {valor}. */
  protected caption(text: Nullable<string>, value: string): string {
    return text === null ? value : text.split('{valor}').join(value);
  }

  protected number(value: Nullable<string>, format: NumberFormatDto): FormattedNumber {
    return NumberFormatter.format(value, format);
  }

  protected indent(row: ReportRow): string {
    return `${String(0.25 + row.level)}rem`;
  }

  protected chartType(element: TemplateElementDto): 'bar' | 'line' | 'pie' {
    return element.chartType === ChartType.LINE
      ? 'line'
      : element.chartType === ChartType.PIE
        ? 'pie'
        : 'bar';
  }

  /** Datos de Chart.js (los colores salen de las variables del tema; los números solo se dibujan). */
  protected chartData(element: TemplateElementDto, rendered: RenderedElement): ChartData {
    const cached: Nullable<ChartData> = this.charts.get(element.id) ?? null;
    if (cached !== null) {
      return cached;
    }
    const palette: string[] = this.palette();
    const pie: boolean = element.chartType === ChartType.PIE;
    const data: ChartData = {
      labels: rendered.labels,
      datasets: rendered.series.map((s: ChartSeries, index: number) => ({
        label: s.label,
        data: s.values.map((v: Nullable<string>): number | null => (v === null ? null : Number(v))),
        backgroundColor: pie
          ? rendered.labels.map((_l: string, i: number): string => palette[i % palette.length] ?? '')
          : (palette[index % palette.length] ?? ''),
        borderColor: palette[index % palette.length] ?? '',
      })),
    };
    this.charts.set(element.id, data);
    return data;
  }

  private palette(): string[] {
    const view: Nullable<Window> = this.document.defaultView;
    if (view === null) {
      return [];
    }
    const styles: CSSStyleDeclaration = view.getComputedStyle(this.document.documentElement);
    return [
      '--p-primary-500',
      '--p-green-500',
      '--p-orange-500',
      '--p-cyan-500',
      '--p-pink-500',
      '--p-indigo-500',
      '--p-yellow-500',
      '--p-teal-500',
    ]
      .map((name: string): string => styles.getPropertyValue(name).trim())
      .filter((color: string): boolean => color !== '');
  }

  private periodText(): string {
    const date: Date = this.month();
    return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.charts.clear();
    const [template, rendered] = await Promise.all([
      this.api.template(this.projectId(), this.templateId()),
      this.api.renderTemplate(this.projectId(), this.templateId(), this.periodText(), this.scope),
    ]);
    this.loading.set(false);
    const failure: Nullable<DomainError> = template.errorOrNull() ?? rendered.errorOrNull();
    if (failure !== null) {
      this.error.set(failure.message);
      return;
    }
    this.show(template, rendered);
  }

  private show(template: Result<TemplateView>, rendered: Result<RenderedTemplate>): void {
    const view: TemplateView = template.unwrap();
    const result: RenderedTemplate = rendered.unwrap();
    this.name.set(view.name);
    this.scopeLabel.set(result.scopeLabel);
    const sheets: PrintSheet[] = view.pages.map(
      (page: TemplatePageDto): PrintSheet =>
        new PrintSheet(
          page,
          PageGeometry.of(page),
          result.pages.find((p: RenderedPage): boolean => p.id === page.id) ?? null,
        ),
    );
    this.pageStyles.textContent = sheets
      .map(
        (s: PrintSheet): string =>
          `@page ${this.pageName(s.page)} { size: ${String(s.geometry.width)}mm ${String(s.geometry.height)}mm; margin: 0; }`,
      )
      .join('\n');
    this.sheets.set(sheets);
  }
}
