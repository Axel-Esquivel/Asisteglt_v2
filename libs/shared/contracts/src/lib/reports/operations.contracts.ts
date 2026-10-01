/** Operaciones sobre los datos cargados: campos calculados, acumulados y conversión (docs/12 §2.7). */
export enum OperationKind {
  CALCULATED = 'CALCULATED',
  YEAR_TO_DATE = 'YEAR_TO_DATE',
  CURRENCY_CONVERSION = 'CURRENCY_CONVERSION',
}

/**
 * Paso de operaciones. `formula` se envía con nombres (`=[Debe] - [Haber]`) y se guarda en forma
 * canónica; los campos que no aplican a un tipo de paso van en `null`.
 */
/** Cómo está cotizada la tasa de la colección. */
export enum RateQuote {
  /** Unidades de la moneda del registro por una unidad de la moneda destino (7.75 GTQ por USD): se divide. */
  UNITS_PER_TARGET = 'UNITS_PER_TARGET',
  /** Unidades de la moneda destino por una unidad de la moneda del registro: se multiplica. */
  TARGET_PER_UNIT = 'TARGET_PER_UNIT',
}

export interface OperationStepDto {
  readonly id: string;
  readonly kind: OperationKind;
  readonly targetKey: string;
  readonly formula: string | null;
  readonly sourceKey: string | null;
  readonly collectionId: string | null;
  readonly rateFieldKey: string | null;
  /** Campo de texto de la colección con la moneda de origen de cada tasa (p. ej. «GTQ»). */
  readonly currencyFieldKey: string | null;
  readonly quote: RateQuote | null;
  readonly targetCurrency: string | null;
}

export interface OperationsRequest {
  readonly steps: ReadonlyArray<OperationStepDto>;
}

export interface OperationsResponse {
  readonly version: number;
  readonly steps: ReadonlyArray<OperationStepDto>;
}

export enum OperationsErrorCode {
  INVALID_OPERATION = 'INVALID_OPERATION',
  TARGET_TYPE_MISMATCH = 'TARGET_TYPE_MISMATCH',
}
