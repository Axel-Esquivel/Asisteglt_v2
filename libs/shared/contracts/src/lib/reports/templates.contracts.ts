import {
  ComputedReportResponse,
  DataScopeDto,
  PeriodGrouping,
  PeriodValue,
  PresentationCurrencyDto,
} from './analysis.contracts';

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
  PIVOT = 'PIVOT',
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
 * Filtros de un valor filtrado o de una tabla dinámica: qué registros entran. Una lista vacía no
 * filtra; los nodos elegidos incluyen sus descendientes.
 */
export interface ValueFilterDto {
  readonly classificationId: string | null;
  readonly nodeIds: ReadonlyArray<string>;
  readonly scope: DataScopeDto;
  readonly periodGrouping: PeriodGrouping;
  readonly periodValue: PeriodValue;
  /** 0 = período del informe; -1 = período anterior. */
  readonly periodOffset: number;
  /** `null` = cada monto en su moneda (no se suman monedas distintas). */
  readonly presentation: PresentationCurrencyDto | null;
}

/** De dónde sale una dimensión de la tabla dinámica. */
export enum PivotSource {
  /** Un encabezado agrupable (p. ej. cuenta, vendedor). */
  FIELD = 'FIELD',
  /** El nodo de una clasificación (`level` 0 = el nodo; 1 = la raíz, 2 = su hijo…). */
  CLASSIFICATION = 'CLASSIFICATION',
  /** Un nivel de la estructura (`key` = organización, país, compañía, empresa o sucursal). */
  ORG = 'ORG',
  CURRENCY = 'CURRENCY',
  MONTH = 'MONTH',
}

export interface PivotDimensionDto {
  readonly source: PivotSource;
  /** Encabezado, clasificación o nivel de la estructura; vacío en moneda y mes. */
  readonly key: string;
  readonly level: number;
}

export enum PivotValueKind {
  /** Un encabezado numérico agregado (p. ej. Saldo) en el período del informe o el anterior. */
  FIELD = 'FIELD',
  /** Diferencia entre dos valores anteriores: A − B (p. ej. variación del mes). */
  DIFFERENCE = 'DIFFERENCE',
  /** Cociente en porcentaje entre dos valores anteriores: A ÷ B × 100 (p. ej. variación %). */
  RATIO = 'RATIO',
}

export interface PivotValueDto {
  readonly kind: PivotValueKind;
  /** Encabezado del valor; `null` en diferencias y cocientes. */
  readonly fieldKey: string | null;
  /** Título; vacío = nombre vigente del encabezado (o «A − B» / «A ÷ B %»). */
  readonly label: string;
  /** 0 = período del informe; -1 = período anterior (solo encabezados). */
  readonly periodOffset: number;
  /** Posiciones (desde 0) de los valores A y B; solo diferencias y cocientes, y anteriores a este. */
  readonly left: number;
  readonly right: number;
}

export interface PivotDto {
  readonly rows: ReadonlyArray<PivotDimensionDto>;
  readonly columns: ReadonlyArray<PivotDimensionDto>;
  readonly values: ReadonlyArray<PivotValueDto>;
  readonly subtotals: boolean;
  /** Título de la columna de filas; vacío = el nombre de las dimensiones. */
  readonly rowTitle: string;
  /** Texto de la fila de total; vacío = «Total». */
  readonly totalLabel: string;
}

/**
 * Elemento de una página. Cada tipo usa sus propiedades y deja el resto en `null` / `[]`:
 * TEXT `text` (admite {periodo}, {mes}, {año}, {fecha}, {proyecto}, {pagina}, {paginas});
 * MATRIX `reportId`; KPI (valor filtrado) `formula` (agregada, con nombres), `filter` y `text`
 * (rótulo con {valor}); CHART `reportId`, `chartType` y `columns` (índices de columnas del informe
 * que se grafican); PIVOT `pivot` y `filter`.
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
  readonly filter: ValueFilterDto | null;
  readonly pivot: PivotDto | null;
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
  /**
   * El alcance (organizaciones, compañías…) lo elige quien genera el informe: reemplaza el de
   * cada tabla de datos y el de los indicadores. Sin marcar, cada tabla usa el suyo.
   */
  readonly scopeParameter: boolean;
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
  /** Alcance con el que se generó, p. ej. «Compañía A, Compañía B» o «Según cada tabla». */
  readonly scopeLabel: string;
  readonly pages: ReadonlyArray<RenderedPageDto>;
}

export enum TemplateErrorCode {
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
}
