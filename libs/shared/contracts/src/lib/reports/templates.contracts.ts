import { ComputedReportResponse } from './analysis.contracts';

/** Plantillas de informe multipágina (docs/04 §11, versión inicial). Medidas en milímetros. */
export enum PageFormatName {
  LETTER = 'LETTER',
  LEGAL = 'LEGAL',
  OFICIO = 'OFICIO',
  A4 = 'A4',
  CUSTOM = 'CUSTOM',
}

export enum PageOrientation {
  PORTRAIT = 'PORTRAIT',
  LANDSCAPE = 'LANDSCAPE',
}

export enum ElementKind {
  TEXT = 'TEXT',
  MATRIX = 'MATRIX',
  KPI = 'KPI',
  CHART = 'CHART',
}

export enum ChartType {
  BAR = 'BAR',
  LINE = 'LINE',
  PIE = 'PIE',
}

export enum TextAlign {
  LEFT = 'LEFT',
  CENTER = 'CENTER',
  RIGHT = 'RIGHT',
}

export enum NegativeStyle {
  MINUS = 'MINUS',
  PARENTHESES = 'PARENTHESES',
  RED = 'RED',
}

export enum NumberScale {
  UNITS = 'UNITS',
  THOUSANDS = 'THOUSANDS',
  MILLIONS = 'MILLIONS',
}

export interface NumberFormatDto {
  readonly decimals: number;
  readonly thousands: boolean;
  readonly negative: NegativeStyle;
  readonly scale: NumberScale;
  readonly prefix: string;
  readonly suffix: string;
}

export interface LayoutBoxDto {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ElementStyleDto {
  /** Puntos tipográficos. */
  readonly fontSize: number;
  readonly bold: boolean;
  readonly align: TextAlign;
}

/**
 * Elemento de una página. Cada tipo usa sus propiedades y deja el resto en `null` / `[]`:
 * TEXT `text` (admite {periodo}, {mes}, {año}, {fecha}, {proyecto}, {pagina}, {paginas});
 * MATRIX `reportId`; KPI `formula` (agregada, con nombres) y filtros; CHART `reportId`,
 * `chartType` y `columns` (índices de columnas del informe que se grafican).
 */
export interface TemplateElementDto {
  readonly id: string;
  readonly kind: ElementKind;
  readonly name: string;
  readonly box: LayoutBoxDto;
  readonly style: ElementStyleDto;
  readonly numberFormat: NumberFormatDto;
  readonly text: string | null;
  readonly reportId: string | null;
  readonly formula: string | null;
  readonly profileId: string | null;
  readonly companyId: string | null;
  readonly chartType: ChartType | null;
  readonly columns: ReadonlyArray<number>;
}

export interface TemplatePageDto {
  readonly id: string;
  readonly name: string;
  readonly format: PageFormatName;
  /** Ancho y alto en orientación vertical; para formatos con nombre los fija la API. */
  readonly width: number;
  readonly height: number;
  readonly orientation: PageOrientation;
  readonly margin: number;
  readonly header: string;
  readonly footer: string;
  readonly elements: ReadonlyArray<TemplateElementDto>;
}

export interface TemplateRequest {
  readonly name: string;
  readonly pages: ReadonlyArray<TemplatePageDto>;
}

export interface TemplateResponse extends TemplateRequest {
  readonly id: string;
  readonly version: number;
  readonly updatedAt: string;
}

export interface ChartSeriesDto {
  readonly label: string;
  readonly values: ReadonlyArray<string | null>;
}

export interface RenderedChartDto {
  readonly labels: ReadonlyArray<string>;
  readonly series: ReadonlyArray<ChartSeriesDto>;
}

export interface RenderedElementDto {
  readonly id: string;
  readonly kind: ElementKind;
  readonly text: string | null;
  readonly table: ComputedReportResponse | null;
  readonly value: string | null;
  readonly chart: RenderedChartDto | null;
  /** Motivo por el que el elemento no se pudo calcular (se muestra en su lugar). */
  readonly error: string | null;
}

export interface RenderedPageDto {
  readonly id: string;
  readonly header: string;
  readonly footer: string;
  readonly elements: ReadonlyArray<RenderedElementDto>;
}

export interface RenderedTemplateResponse {
  readonly templateId: string;
  readonly name: string;
  readonly period: string;
  readonly pages: ReadonlyArray<RenderedPageDto>;
}

export enum TemplateErrorCode {
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
}
