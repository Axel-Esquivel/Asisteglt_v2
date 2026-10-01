/** Cuerpo de toda respuesta de error de la API. */
export interface ApiErrorResponse {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly timestamp: string;
}

/** Códigos de error transversales (cada contexto agrega los suyos). */
export enum CommonErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
}
