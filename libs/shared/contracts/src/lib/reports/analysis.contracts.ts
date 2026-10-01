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

export enum RowSource {
  CLASSIFICATION = 'CLASSIFICATION',
  FIELD = 'FIELD',
}

export interface ReportDefinitionRequest {
  readonly name: string;
  readonly rowSource: RowSource;
  readonly classificationId: string | null;
  readonly rowFieldKey: string | null;
  readonly measures: ReadonlyArray<string>;
  readonly profileId: string | null;
  readonly companyId: string | null;
  /** Encabezado sí/no que debe ser verdadero (p. ej. «Es cuenta de detalle»). */
  readonly onlyWhenFieldKey: string | null;
  readonly includeUnclassified: boolean;
}

export interface ReportDefinitionResponse extends ReportDefinitionRequest {
  readonly id: string;
  readonly updatedAt: string;
}

export interface ReportColumnResponse {
  readonly fieldKey: string;
  readonly label: string;
}

export interface ReportRowResponse {
  readonly key: string;
  readonly label: string;
  readonly level: number;
  readonly total: boolean;
  readonly values: ReadonlyArray<string | null>;
}

export interface ComputedReportResponse {
  readonly definitionId: string;
  readonly name: string;
  readonly period: string;
  readonly records: number;
  readonly columns: ReadonlyArray<ReportColumnResponse>;
  readonly rows: ReadonlyArray<ReportRowResponse>;
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
