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
export interface OperationStepDto {
  readonly id: string;
  readonly kind: OperationKind;
  readonly targetKey: string;
  readonly formula: string | null;
  readonly sourceKey: string | null;
  readonly collectionId: string | null;
  readonly rateFieldKey: string | null;
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
