import { Decimal as DecimalJs } from 'decimal.js';
import { Result } from '../core/result';
import { ValidationError } from '../errors/domain-error';
import { ValueObject } from '../domain/value-object';

export enum RoundingMode {
  HALF_UP = 'HALF_UP',
  HALF_EVEN = 'HALF_EVEN',
  DOWN = 'DOWN',
  UP = 'UP',
}

const Engine: DecimalJs.Constructor = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });

/**
 * Número decimal exacto para montos y cantidades. Nunca usar `number` para dinero.
 */
export class Decimal extends ValueObject {
  private static readonly PATTERN: RegExp = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

  private constructor(private readonly value: DecimalJs) {
    super();
  }

  public static of(raw: string): Result<Decimal> {
    const text: string = raw.trim();
    if (!Decimal.PATTERN.test(text)) {
      return Result.fail(new ValidationError('INVALID_DECIMAL', `Número decimal inválido: ${raw}`));
    }
    return Result.ok(new Decimal(new Engine(text)));
  }

  public static fromInteger(value: number): Result<Decimal> {
    if (!Number.isSafeInteger(value)) {
      return Result.fail(new ValidationError('INVALID_INTEGER', `Entero inválido: ${String(value)}`));
    }
    return Result.ok(new Decimal(new Engine(value)));
  }

  public static zero(): Decimal {
    return new Decimal(new Engine(0));
  }

  public add(other: Decimal): Decimal {
    return new Decimal(this.value.plus(other.value));
  }

  public subtract(other: Decimal): Decimal {
    return new Decimal(this.value.minus(other.value));
  }

  public multiply(other: Decimal): Decimal {
    return new Decimal(this.value.times(other.value));
  }

  public divide(other: Decimal): Result<Decimal> {
    if (other.isZero()) {
      return Result.fail(new ValidationError('DIVISION_BY_ZERO', 'No se puede dividir entre cero'));
    }
    return Result.ok(new Decimal(this.value.dividedBy(other.value)));
  }

  public negate(): Decimal {
    return new Decimal(this.value.negated());
  }

  public abs(): Decimal {
    return new Decimal(this.value.abs());
  }

  public isZero(): boolean {
    return this.value.isZero();
  }

  public isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  public compareTo(other: Decimal): number {
    return this.value.comparedTo(other.value);
  }

  public round(places: number, mode: RoundingMode): Decimal {
    return new Decimal(this.value.toDecimalPlaces(places, Decimal.toEngineRounding(mode)));
  }

  public toFixed(places: number): string {
    return this.value.toFixed(places, DecimalJs.ROUND_HALF_UP);
  }

  public override toString(): string {
    return this.value.toFixed();
  }

  protected override equalityKey(): string {
    return this.value.toFixed();
  }

  private static toEngineRounding(mode: RoundingMode): DecimalJs.Rounding {
    switch (mode) {
      case RoundingMode.HALF_UP:
        return DecimalJs.ROUND_HALF_UP;
      case RoundingMode.HALF_EVEN:
        return DecimalJs.ROUND_HALF_EVEN;
      case RoundingMode.DOWN:
        return DecimalJs.ROUND_DOWN;
      case RoundingMode.UP:
        return DecimalJs.ROUND_UP;
    }
  }
}
