import { DataType, EmptyHandling, FieldRole } from '@asisteglt/shared-contracts';
import { Decimal, Nullable, Result, RoundingMode, ValidationError } from '@asisteglt/shared-kernel';
import { CellValue } from './cell-value';
import { ColumnSpec } from './column-spec';
import { DatePattern } from './date-pattern';

/** Convierte el texto de una celda al tipo de su encabezado, con los mensajes de docs/11 §5. */
export class ValueParser {
  private readonly datePattern: DatePattern;

  public constructor(
    private readonly column: ColumnSpec,
    private readonly label: string,
  ) {
    this.datePattern = DatePattern.of(column.datePattern);
  }

  public parse(raw: string): Result<CellValue> {
    const text: string = raw.trim();
    if (text.length === 0) {
      return this.empty();
    }
    switch (this.column.dataType) {
      case DataType.TEXT:
        return Result.ok(text);
      case DataType.INTEGER:
        return this.number(text, true);
      case DataType.DECIMAL:
        return this.number(text, false);
      case DataType.DATE:
        return this.date(text);
      case DataType.BOOLEAN:
        return this.boolean(text);
    }
  }

  private empty(): Result<CellValue> {
    if (this.column.role === FieldRole.IDENTIFIER) {
      return this.fail(`«${this.label}» vacío`);
    }
    const numeric: boolean =
      this.column.dataType === DataType.INTEGER || this.column.dataType === DataType.DECIMAL;
    return Result.ok(numeric && this.column.emptyHandling === EmptyHandling.ZERO ? '0' : null);
  }

  private number(text: string, integer: boolean): Result<CellValue> {
    let body: string = text.replace(/\s+/g, '');
    let negative: boolean = false;
    if (/^\(.*\)$/.test(body)) {
      negative = true;
      body = body.slice(1, -1);
    }
    if (/cr$/i.test(body)) {
      negative = true;
      body = body.slice(0, -2);
    }
    if (body.startsWith('-')) {
      negative = !negative;
      body = body.slice(1);
    } else if (body.endsWith('-')) {
      negative = !negative;
      body = body.slice(0, -1);
    }
    const normalized: Nullable<string> = this.normalizeDigits(body);
    if (normalized === null) {
      return this.fail(
        `«${this.label}»: «${text}» no es ${integer ? 'un entero' : 'un decimal'} con el formato configurado`,
      );
    }
    body = normalized;
    const parsed: Result<Decimal> = Decimal.of(body.startsWith('.') ? `0${body}` : body);
    if (!parsed.isOk()) {
      return this.fail(`«${this.label}»: «${text}» no es un número válido`);
    }
    const value: Decimal = negative ? parsed.unwrap().negate() : parsed.unwrap();
    if (integer && value.round(0, RoundingMode.HALF_UP).compareTo(value) !== 0) {
      return this.fail(`«${this.label}»: «${text}» no es un número entero`);
    }
    return Result.ok(value.isZero() ? '0' : value.toString());
  }

  /** Valida separadores (miles en grupos de 3, un solo decimal) y devuelve el número con punto. */
  private normalizeDigits(body: string): Nullable<string> {
    const decimal: string = this.column.decimalSeparator;
    const thousands: string = this.column.thousandsSeparator;
    const parts: string[] = body.split(decimal);
    if (parts.length > 2) {
      return null;
    }
    const integerPart: string = parts[0] ?? '';
    const fraction: string = parts[1] ?? '';
    if (fraction.length > 0 && !/^\d+$/.test(fraction)) {
      return null;
    }
    const escaped: string = thousands.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const grouped: RegExp = thousands.length > 0 ? new RegExp(`^\\d{1,3}(${escaped}\\d{3})+$`) : /^$/;
    const validInteger: boolean =
      integerPart === '' ? fraction.length > 0 : /^\d+$/.test(integerPart) || grouped.test(integerPart);
    if (!validInteger) {
      return null;
    }
    const digits: string = thousands.length > 0 ? integerPart.split(thousands).join('') : integerPart;
    return `${digits === '' ? '0' : digits}${fraction.length > 0 ? `.${fraction}` : ''}`;
  }

  private date(text: string): Result<CellValue> {
    const iso: Nullable<string> = this.datePattern.parse(text);
    return iso === null
      ? this.fail(`«${this.label}»: «${text}» no cumple el formato de fecha ${this.column.datePattern}`)
      : Result.ok(iso);
  }

  private boolean(text: string): Result<CellValue> {
    const value: string = text.toLocaleLowerCase();
    if (value === this.column.trueText.trim().toLocaleLowerCase()) {
      return Result.ok(true);
    }
    if (value === this.column.falseText.trim().toLocaleLowerCase()) {
      return Result.ok(false);
    }
    return this.fail(`«${this.label}»: «${text}» no es un valor de sí/no configurado`);
  }

  private fail(message: string): Result<CellValue> {
    return Result.fail(new ValidationError('INVALID_CELL', message));
  }
}
