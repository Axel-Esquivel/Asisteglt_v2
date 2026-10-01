import { Result } from '../core/result';
import { ValidationError } from '../errors/domain-error';
import { ValueObject } from '../domain/value-object';

/** Mes y año de una carga o de un informe. */
export class Period extends ValueObject {
  private static readonly MIN_YEAR: number = 1900;
  private static readonly MAX_YEAR: number = 2999;

  private constructor(
    public readonly year: number,
    public readonly month: number,
  ) {
    super();
  }

  public static of(year: number, month: number): Result<Period> {
    if (!Number.isInteger(year) || year < Period.MIN_YEAR || year > Period.MAX_YEAR) {
      return Result.fail(new ValidationError('PERIOD_INVALID_YEAR', `Año inválido: ${String(year)}`));
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return Result.fail(new ValidationError('PERIOD_INVALID_MONTH', `Mes inválido: ${String(month)}`));
    }
    return Result.ok(new Period(year, month));
  }

  public previous(): Period {
    return this.month === 1 ? new Period(this.year - 1, 12) : new Period(this.year, this.month - 1);
  }

  public next(): Period {
    return this.month === 12 ? new Period(this.year + 1, 1) : new Period(this.year, this.month + 1);
  }

  /** Primer período del ejercicio fiscal que contiene a este período. */
  public startOfFiscalYear(fiscalStartMonth: number): Result<Period> {
    if (!Number.isInteger(fiscalStartMonth) || fiscalStartMonth < 1 || fiscalStartMonth > 12) {
      return Result.fail(
        new ValidationError(
          'PERIOD_INVALID_FISCAL_START',
          `Mes de inicio fiscal inválido: ${String(fiscalStartMonth)}`,
        ),
      );
    }
    const year: number = this.month >= fiscalStartMonth ? this.year : this.year - 1;
    return Period.of(year, fiscalStartMonth);
  }

  public compareTo(other: Period): number {
    return this.ordinal() - other.ordinal();
  }

  public isBefore(other: Period): boolean {
    return this.compareTo(other) < 0;
  }

  /** Períodos desde este hasta `other`, ambos incluidos; vacío si `other` es anterior. */
  public rangeTo(other: Period): Period[] {
    const periods: Period[] = [];
    let cursor: Period = new Period(this.year, this.month);
    while (cursor.compareTo(other) <= 0) {
      periods.push(cursor);
      cursor = cursor.next();
    }
    return periods;
  }

  public override toString(): string {
    return `${String(this.year)}-${String(this.month).padStart(2, '0')}`;
  }

  protected override equalityKey(): string {
    return this.toString();
  }

  private ordinal(): number {
    return this.year * 12 + (this.month - 1);
  }
}
