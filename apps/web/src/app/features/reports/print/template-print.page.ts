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
import { ReportsApiClient } from '../data/reports.api-client';
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
    const period: string = this.route.snapshot.queryParamMap.get('period') ?? '';
    const match: Nullable<RegExpExecArray> = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
    if (match !== null) {
      this.month.set(new Date(Number(match[1] ?? '0'), Number(match[2] ?? '1') - 1, 1));
    }
    this.document.head.appendChild(this.pageStyles);
    this.load().catch((): void => {
      this.error.set('No se pudo calcular la plantilla');
    });
  }

  public ngOnDestroy(): void {
    this.pageStyles.remove();
  }

  protected async changeMonth(date: Nullable<Date>): Promise<void> {
    if (date === null) {
      return;
    }
    this.month.set(date);
    await this.router.navigate([], { queryParams: { period: this.periodText() }, replaceUrl: true });
    await this.load();
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
      this.api.renderTemplate(this.projectId(), this.templateId(), this.periodText()),
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
