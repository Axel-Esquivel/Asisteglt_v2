import { RateQuote } from './operations.contracts';
import { OrgLevel } from './org-structure.contracts';

/** Clasificaciones e informes matriciales (docs/04 §8 y §11, versión inicial). */
export interface ClassificationNodeDto {
  readonly id: string;
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly patterns: ReadonlyArray<string>;
}

export interface ClassificationRequest {
  readonly name: string;
  readonly fieldKey: string;
  readonly nodes: ReadonlyArray<ClassificationNodeDto>;
}

export interface ClassificationResponse extends ClassificationRequest {
  readonly id: string;
  readonly updatedAt: string;
}

/** Un valor distinto del encabezado clasificable en los datos publicados (p. ej. una cuenta). */
export interface ClassifiableValueResponse {
  readonly value: string;
  /** Nombre tomado del encabezado «nombre de» que describe al identificador, si existe. */
  readonly name: string | null;
  readonly firstPeriod: string;
  readonly lastPeriod: string;
  readonly records: number;
}

export interface ClassifiableValuesResponse {
  readonly fieldKey: string;
  /** Período más reciente con datos; los valores que aparecen por primera vez en él son nuevos. */
  readonly latestPeriod: string | null;
  readonly values: ReadonlyArray<ClassifiableValueResponse>;
  /** `true` si hay más valores que el máximo devuelto. */
  readonly truncated: boolean;
}

export enum RowSource {
  CLASSIFICATION = 'CLASSIFICATION',
  FIELD = 'FIELD',
}

/** Columna calculada con una fórmula en contexto agregado, p. ej. `=SUMA([Debe]) - SUMA([Haber])`. */
export interface FormulaColumnDto {
  readonly label: string;
  /** Se envía con nombres y se devuelve con los nombres vigentes. */
  readonly formula: string;
}

/** Agrupación de meses de una tabla de datos; el período elegido es el mes de cierre. */
export enum PeriodGrouping {
  MONTH = 'MONTH',
  BIMESTER = 'BIMESTER',
  QUARTER = 'QUARTER',
  SEMESTER = 'SEMESTER',
  YEAR = 'YEAR',
}

/** Cómo toma una columna los datos cuando el período agrupa varios meses. */
export enum PeriodValue {
  /** Valor del último mes del período (p. ej. un saldo). */
  CLOSING = 'CLOSING',
  /** Valor del primer mes del período (p. ej. un saldo anterior). */
  OPENING = 'OPENING',
  /** Suma (o agregación) de todos los meses del período (p. ej. movimientos o ventas). */
  ACCUMULATED = 'ACCUMULATED',
}

export enum DataColumnKind {
  MEASURE = 'MEASURE',
  FORMULA = 'FORMULA',
}

/**
 * Columna de valores de una tabla de datos, en el orden en que se muestra. Una medida toma un
 * encabezado (cargado u operado); una fórmula, una expresión agregada.
 */
export interface DataColumnDto {
  readonly kind: DataColumnKind;
  /** Título; vacío = nombre vigente del encabezado (solo medidas). */
  readonly label: string;
  /** Encabezado de la medida; `null` en fórmulas. */
  readonly fieldKey: string | null;
  /** Fórmula de la columna; `null` en medidas. */
  readonly formula: string | null;
  readonly periodValue: PeriodValue;
  /** 0 = período del informe; -1 = período anterior (enero → diciembre del año anterior). */
  readonly periodOffset: number;
}

/** Alcance de una tabla de datos; una lista vacía no filtra ese nivel. */
export interface DataScopeDto {
  readonly organizationIds: ReadonlyArray<string>;
  readonly countryIds: ReadonlyArray<string>;
  readonly currencies: ReadonlyArray<string>;
  readonly companyIds: ReadonlyArray<string>;
  readonly enterpriseIds: ReadonlyArray<string>;
  readonly branchIds: ReadonlyArray<string>;
}

/** Tabla de datos guardada (antes «informe»): origen, alcance, período, filas y columnas. */
/**
 * Moneda de presentación: convierte los montos y precios de la tabla con las tasas de una
 * colección (p. ej. «Tipo de cambio»). Cada registro se convierte con la tasa de su mes, así un
 * saldo de cierre usa la tasa de cierre y un acumulado suma cada mes a su propia tasa.
 */
export interface PresentationCurrencyDto {
  readonly targetCurrency: string;
  readonly collectionId: string;
  readonly rateFieldKey: string;
  readonly currencyFieldKey: string;
  readonly quote: RateQuote;
}

export interface ReportDefinitionRequest {
  readonly name: string;
  readonly rowSource: RowSource;
  readonly classificationId: string | null;
  readonly rowFieldKey: string | null;
  /** Clasificaciones que se muestran como columnas de texto (el grupo de cada fila). */
  readonly classificationColumns: ReadonlyArray<string>;
  readonly columns: ReadonlyArray<DataColumnDto>;
  readonly profileId: string | null;
  readonly scope: DataScopeDto;
  readonly periodGrouping: PeriodGrouping;
  /** Niveles de la estructura que abren las columnas (p. ej. organización › país › compañía). */
  readonly columnSplit: ReadonlyArray<OrgLevel>;
  /** Con columnas abiertas: agrega subtotales por nivel y el total consolidado. */
  readonly subtotals: boolean;
  /** Encabezado sí/no que debe ser verdadero (p. ej. «Es cuenta de detalle»). */
  readonly onlyWhenFieldKey: string | null;
  readonly includeUnclassified: boolean;
  /** `null` = cada monto en su moneda (no se suman monedas distintas). */
  readonly presentation: PresentationCurrencyDto | null;
}

export interface ReportDefinitionResponse extends ReportDefinitionRequest {
  readonly id: string;
  readonly updatedAt: string;
}

export interface ReportColumnResponse {
  /** Clave estable de la columna (el encabezado si no hay grupos ni período distinto). */
  readonly fieldKey: string;
  readonly label: string;
  /** Títulos de los grupos que la contienen (p. ej. organización, país, compañía); vacío sin grupos. */
  readonly group: ReadonlyArray<string>;
  /** Columna de subtotal o total consolidado. */
  readonly subtotal: boolean;
}

/** Columna de texto de cada fila: identificador, su nombre o el grupo de una clasificación. */
export interface ReportAttributeColumnResponse {
  readonly key: string;
  readonly label: string;
}

export interface ReportRowResponse {
  readonly key: string;
  readonly label: string;
  readonly level: number;
  readonly total: boolean;
  /** Textos de la fila, alineados con `attributeColumns`. */
  readonly attributes: ReadonlyArray<string | null>;
  readonly values: ReadonlyArray<string | null>;
}

export interface ComputedReportResponse {
  readonly definitionId: string;
  readonly name: string;
  readonly period: string;
  /** Meses que cubre el período, p. ej. «01/2026 – 03/2026». */
  readonly periodLabel: string;
  readonly records: number;
  /** Moneda a la que se convirtieron los montos; `null` si no se convierten. */
  readonly presentationCurrency: string | null;
  readonly attributeColumns: ReadonlyArray<ReportAttributeColumnResponse>;
  readonly columns: ReadonlyArray<ReportColumnResponse>;
  readonly rows: ReadonlyArray<ReportRowResponse>;
  /** Avisos del cálculo (p. ej. montos en monedas distintas que no se sumaron). */
  readonly warnings: ReadonlyArray<string>;
}

export enum AnalysisErrorCode {
  INVALID_CLASSIFICATION = 'INVALID_CLASSIFICATION',
  CLASSIFICATION_NOT_FOUND = 'CLASSIFICATION_NOT_FOUND',
  INVALID_REPORT = 'INVALID_REPORT',
  REPORT_NOT_FOUND = 'REPORT_NOT_FOUND',
  FIELD_NOT_CLASSIFIABLE = 'FIELD_NOT_CLASSIFIABLE',
  FIELD_NOT_AGGREGATABLE = 'FIELD_NOT_AGGREGATABLE',
  FIELD_NOT_GROUPABLE = 'FIELD_NOT_GROUPABLE',
}
