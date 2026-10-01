import { ValidationError } from '@asisteglt/shared-kernel';

export enum FormulaErrorCode {
  SYNTAX_ERROR = 'FORMULA_SYNTAX_ERROR',
  UNKNOWN_FIELD = 'UNKNOWN_FIELD',
  FIELD_INACTIVE = 'FIELD_INACTIVE',
  UNKNOWN_FUNCTION = 'UNKNOWN_FUNCTION',
  VALUE_TYPE_MISMATCH = 'VALUE_TYPE_MISMATCH',
  FIELD_NOT_AGGREGATABLE = 'FIELD_NOT_AGGREGATABLE',
  AGGREGATE_NOT_ALLOWED = 'AGGREGATE_NOT_ALLOWED',
  ARGUMENT_COUNT = 'ARGUMENT_COUNT',
}

/** Error de compilación de una fórmula, con la posición (0-based) cuando se conoce. */
export class FormulaError extends ValidationError {
  public constructor(
    code: FormulaErrorCode,
    message: string,
    public readonly position: number,
  ) {
    super(code, message);
  }
}
