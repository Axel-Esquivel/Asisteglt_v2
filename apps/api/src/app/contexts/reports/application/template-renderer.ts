import {
  ComputedReportResponse,
  ElementKind,
  RenderedChartDto,
  RenderedElementDto,
  ReportRowResponse,
} from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import {
  ChartElement,
  KpiElement,
  MatrixElement,
  ReportElementVisitor,
  TextElement,
} from '../domain/report-template';
import { AnalysisService } from './analysis.service';

/** Textos con marcadores: {periodo}, {mes}, {año}, {fecha}, {proyecto}, {pagina}, {paginas}. */
export class TemplateText {
  private static readonly MONTHS: ReadonlyArray<string> = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];

  public constructor(
    private readonly period: string,
    private readonly project: string,
    private readonly today: Date,
    private readonly page: number,
    private readonly pages: number,
  ) {}

  public resolve(text: string): string {
    const [year, month] = this.period.split('-');
    const monthName: string = TemplateText.MONTHS[Number(month ?? '1') - 1] ?? '';
    const pad = (n: number): string => String(n).padStart(2, '0');
    const date: string = `${pad(this.today.getUTCDate())}/${pad(this.today.getUTCMonth() + 1)}/${String(this.today.getUTCFullYear())}`;
    const values: ReadonlyMap<string, string> = new Map<string, string>([
      ['periodo', `${month ?? ''}/${year ?? ''}`],
      ['mes', monthName],
      ['año', year ?? ''],
      ['fecha', date],
      ['proyecto', this.project],
      ['pagina', String(this.page)],
      ['paginas', String(this.pages)],
    ]);
    return text.replace(/\{([a-zñ]+)\}/g, (whole: string, name: string): string => values.get(name) ?? whole);
  }
}

/** Calcula cada elemento de una página para un período (Visitor sobre los elementos). */
export class ElementRenderer implements ReportElementVisitor<Promise<RenderedElementDto>> {
  /** Un informe usado por varios elementos se calcula una sola vez. */
  private readonly reports: Map<string, Promise<Result<ComputedReportResponse>>>;

  public constructor(
    private readonly analysis: AnalysisService,
    private readonly project: Project,
    private readonly period: string,
    private readonly text: TemplateText,
    reports: Map<string, Promise<Result<ComputedReportResponse>>>,
  ) {
    this.reports = reports;
  }

  public visitText(element: TextElement): Promise<RenderedElementDto> {
    return Promise.resolve({
      ...ElementRenderer.empty(element.id, ElementKind.TEXT),
      text: this.text.resolve(element.content),
    });
  }

  public async visitMatrix(element: MatrixElement): Promise<RenderedElementDto> {
    return (await this.report(element.reportId)).match(
      (table: ComputedReportResponse): RenderedElementDto => ({
        ...ElementRenderer.empty(element.id, ElementKind.MATRIX),
        table,
      }),
      (e: DomainError): RenderedElementDto => ({
        ...ElementRenderer.empty(element.id, ElementKind.MATRIX),
        error: e.message,
      }),
    );
  }

  public async visitKpi(element: KpiElement): Promise<RenderedElementDto> {
    return (
      await this.analysis.kpi(
        this.project,
        element.formula,
        this.period,
        element.profileId,
        element.companyId,
      )
    ).match(
      (value: Nullable<string>): RenderedElementDto => ({
        ...ElementRenderer.empty(element.id, ElementKind.KPI),
        value,
      }),
      (e: DomainError): RenderedElementDto => ({
        ...ElementRenderer.empty(element.id, ElementKind.KPI),
        error: e.message,
      }),
    );
  }

  public async visitChart(element: ChartElement): Promise<RenderedElementDto> {
    return (await this.report(element.reportId)).match(
      (table: ComputedReportResponse): RenderedElementDto => ({
        ...ElementRenderer.empty(element.id, ElementKind.CHART),
        chart: ElementRenderer.chart(table, element.columns),
      }),
      (e: DomainError): RenderedElementDto => ({
        ...ElementRenderer.empty(element.id, ElementKind.CHART),
        error: e.message,
      }),
    );
  }

  private report(reportId: string): Promise<Result<ComputedReportResponse>> {
    const cached: Nullable<Promise<Result<ComputedReportResponse>>> = this.reports.get(reportId) ?? null;
    if (cached !== null) {
      return cached;
    }
    const computing: Promise<Result<ComputedReportResponse>> = this.analysis.compute(
      this.project,
      reportId,
      this.period,
    );
    this.reports.set(reportId, computing);
    return computing;
  }

  /** Categorías: las filas de detalle (sin subtotales ni total); series: las columnas elegidas. */
  private static chart(table: ComputedReportResponse, columns: ReadonlyArray<number>): RenderedChartDto {
    const rows: ReportRowResponse[] = table.rows.filter((r: ReportRowResponse): boolean => !r.total);
    return {
      labels: rows.map((r: ReportRowResponse): string => r.label),
      series: columns.map((index: number) => ({
        label: (table.columns[index] ?? { label: '' }).label,
        values: rows.map((r: ReportRowResponse): string | null => r.values[index] ?? null),
      })),
    };
  }

  private static empty(id: string, kind: ElementKind): RenderedElementDto {
    return { id, kind, text: null, table: null, value: null, chart: null, error: null };
  }
}
