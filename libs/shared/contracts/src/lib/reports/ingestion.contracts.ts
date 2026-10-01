import { DataType, EmptyHandling, FieldRole, NumericNature } from './catalog.contracts';

/** Reglas de líneas (docs/11 §3, paso 3). */
export enum RowRuleKind {
  SKIP_BLANK = 'SKIP_BLANK',
  SKIP_PAGE_BREAKS = 'SKIP_PAGE_BREAKS',
  SKIP_LEADING = 'SKIP_LEADING',
  SKIP_MATCHING = 'SKIP_MATCHING',
  PAGE_HEADER_BLOCK = 'PAGE_HEADER_BLOCK',
}

export enum TextOperator {
  STARTS_WITH = 'STARTS_WITH',
  CONTAINS = 'CONTAINS',
  ENDS_WITH = 'ENDS_WITH',
}

export interface RowRuleSpec {
  readonly kind: RowRuleKind;
  readonly count: number;
  readonly operator: TextOperator;
  readonly text: string;
  readonly signatures: ReadonlyArray<string>;
}

/** Columna de una preconfiguración: franja + encabezado del catálogo (por clave) + formato. */
export interface ColumnSpec {
  readonly bandIndex: number;
  readonly fieldKey: string;
  readonly role: FieldRole;
  readonly dataType: DataType;
  readonly nature: NumericNature | null;
  readonly emptyHandling: EmptyHandling;
  readonly thousandsSeparator: string;
  readonly decimalSeparator: string;
  readonly datePattern: string;
  readonly trueText: string;
  readonly falseText: string;
}

export interface IdentifierMaskSpec {
  readonly fieldKey: string;
  readonly pattern: string;
}

export enum DerivedAttributeKind {
  CODE_SEGMENTS_LEVEL = 'CODE_SEGMENTS_LEVEL',
  INDENTATION_LEVEL = 'INDENTATION_LEVEL',
  LEAF_FLAG = 'LEAF_FLAG',
}

export interface DerivedAttributeSpec {
  readonly kind: DerivedAttributeKind;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly separator: string;
  readonly spacesPerLevel: number;
}

/** Lectura completa de un archivo de ancho fijo (lo que guarda la preconfiguración). */
export interface FixedWidthSpec {
  readonly encoding: string;
  readonly tabSize: number;
  readonly lineLength: number;
  readonly dividers: ReadonlyArray<number>;
  readonly rowRules: ReadonlyArray<RowRuleSpec>;
  readonly masks: ReadonlyArray<IdentifierMaskSpec>;
  readonly columns: ReadonlyArray<ColumnSpec>;
  readonly derived: ReadonlyArray<DerivedAttributeSpec>;
}

export enum ProfileStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum SourceType {
  FIXED_WIDTH = 'FIXED_WIDTH',
}

export interface ProfileRequest {
  readonly name: string;
  readonly description: string;
  readonly extensions: ReadonlyArray<string>;
  readonly fileNamePattern: string | null;
  readonly spec: FixedWidthSpec;
}

export interface ProfileResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourceType: SourceType;
  readonly extensions: ReadonlyArray<string>;
  readonly fileNamePattern: string | null;
  readonly status: ProfileStatus;
  readonly version: number;
  readonly spec: FixedWidthSpec;
  readonly updatedAt: string;
}

export enum ImportItemStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  SUPERSEDED = 'SUPERSEDED',
}

/** Propiedades de cada archivo del lote (en el mismo orden que los archivos subidos). */
export interface ImportItemRequest {
  readonly fileName: string;
  readonly profileId: string;
  readonly period: string;
  readonly organizationId: string;
  readonly countryId: string;
  readonly currency: string;
  readonly companyId: string;
  readonly enterpriseId: string | null;
  readonly branchId: string | null;
}

export interface ImportManifest {
  readonly items: ReadonlyArray<ImportItemRequest>;
}

export interface ImportIssueResponse {
  readonly line: number;
  readonly messages: ReadonlyArray<string>;
}

export interface ImportItemResponse extends ImportItemRequest {
  readonly id: string;
  readonly batchId: string;
  readonly size: number;
  readonly profileName: string;
  readonly profileVersion: number;
  readonly status: ImportItemStatus;
  readonly total: number;
  readonly data: number;
  readonly ignored: number;
  readonly rejected: number;
  readonly issues: ReadonlyArray<ImportIssueResponse>;
  readonly error: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface ImportBatchResponse {
  readonly id: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly items: ReadonlyArray<ImportItemResponse>;
}

export interface DataRecordResponse {
  readonly id: string;
  readonly line: number;
  readonly loadId: string;
  readonly period: string;
  readonly companyId: string;
  readonly currency: string;
  readonly values: Readonly<Record<string, string | boolean | null>>;
}

export interface DataRecordPageResponse {
  readonly total: number;
  readonly page: number;
  readonly size: number;
  readonly rows: ReadonlyArray<DataRecordResponse>;
}

export interface ImportItemEvent {
  readonly projectId: string;
  readonly item: ImportItemResponse;
}

export enum IngestionErrorCode {
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  INVALID_PROFILE = 'INVALID_PROFILE',
  DUPLICATE_PROFILE_NAME = 'DUPLICATE_PROFILE_NAME',
  PROFILE_NOT_ACTIVE = 'PROFILE_NOT_ACTIVE',
  INVALID_IMPORT = 'INVALID_IMPORT',
  IMPORT_NOT_FOUND = 'IMPORT_NOT_FOUND',
}
