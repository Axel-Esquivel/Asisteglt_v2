/** Catálogo de encabezados (docs/12 §2). Las referencias siempre usan la clave (`key`). */
export enum FieldRole {
  IDENTIFIER = 'IDENTIFIER',
  IDENTIFIER_NAME = 'IDENTIFIER_NAME',
  DATA = 'DATA',
}

export enum DataType {
  TEXT = 'TEXT',
  INTEGER = 'INTEGER',
  DECIMAL = 'DECIMAL',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
}

export enum NumericNature {
  AMOUNT = 'AMOUNT',
  QUANTITY = 'QUANTITY',
  RATE = 'RATE',
  UNIT_PRICE = 'UNIT_PRICE',
  DESCRIPTIVE = 'DESCRIPTIVE',
}

export enum Aggregation {
  SUM = 'SUM',
  AVERAGE = 'AVERAGE',
  WEIGHTED_AVERAGE = 'WEIGHTED_AVERAGE',
  MIN = 'MIN',
  MAX = 'MAX',
  LAST = 'LAST',
  COUNT = 'COUNT',
  NONE = 'NONE',
}

export enum FieldOrigin {
  IMPORTED = 'IMPORTED',
  DERIVED = 'DERIVED',
}

export enum EmptyHandling {
  ZERO = 'ZERO',
  NO_VALUE = 'NO_VALUE',
}

export interface CatalogFieldResponse {
  readonly key: string;
  readonly label: string;
  readonly origin: FieldOrigin;
  readonly role: FieldRole;
  readonly dataType: DataType;
  readonly nature: NumericNature | null;
  readonly aggregation: Aggregation;
  readonly describes: string | null;
  readonly weightField: string | null;
  readonly active: boolean;
}

export interface FieldCatalogResponse {
  readonly version: number;
  readonly fields: ReadonlyArray<CatalogFieldResponse>;
}

export interface CatalogFieldRequest {
  readonly label: string;
  readonly origin: FieldOrigin;
  readonly role: FieldRole;
  readonly dataType: DataType;
  readonly nature: NumericNature | null;
  readonly aggregation: Aggregation | null;
  readonly describes: string | null;
  readonly weightField: string | null;
}

export interface RenameFieldRequest {
  readonly label: string;
}

export enum CatalogTemplate {
  ACCOUNTING = 'ACCOUNTING',
  SALES = 'SALES',
}

export interface ApplyTemplateRequest {
  readonly template: CatalogTemplate;
}

export enum CatalogErrorCode {
  INVALID_FIELD_LABEL = 'INVALID_FIELD_LABEL',
  DUPLICATE_FIELD_LABEL = 'DUPLICATE_FIELD_LABEL',
  FIELD_NOT_FOUND = 'FIELD_NOT_FOUND',
  INVALID_FIELD_DEFINITION = 'INVALID_FIELD_DEFINITION',
  FIELD_IN_USE = 'FIELD_IN_USE',
  CATALOG_VERSION_CONFLICT = 'CATALOG_VERSION_CONFLICT',
}
