import { Aggregation } from '@asisteglt/shared-contracts';
import { Decimal, Nullable, Result } from '@asisteglt/shared-kernel';

/**
 * Acumula una medida según su agregación, siempre con `Decimal`. Se puede combinar con otro
 * acumulador (subtotales de los nodos superiores).
 */
export class Accumulator {
  private sum: Decimal = Decimal.zero();
  private weightedSum: Decimal = Decimal.zero();
  private weightTotal: Decimal = Decimal.zero();
  private count: number = 0;
  private min: Nullable<Decimal> = null;
  private max: Nullable<Decimal> = null;
  private last: Nullable<Decimal> = null;

  public constructor(private readonly aggregation: Aggregation) {}

  public add(value: Nullable<Decimal>, weight: Nullable<Decimal>): void {
    if (value === null) {
      return;
    }
    this.sum = this.sum.add(value);
    this.count += 1;
    this.min = this.min === null || value.compareTo(this.min) < 0 ? value : this.min;
    this.max = this.max === null || value.compareTo(this.max) > 0 ? value : this.max;
    this.last = value;
    if (weight !== null) {
      this.weightedSum = this.weightedSum.add(value.multiply(weight));
      this.weightTotal = this.weightTotal.add(weight);
    }
  }

  public merge(other: Accumulator): void {
    this.sum = this.sum.add(other.sum);
    this.weightedSum = this.weightedSum.add(other.weightedSum);
    this.weightTotal = this.weightTotal.add(other.weightTotal);
    this.count += other.count;
    if (other.min !== null) {
      this.min = this.min === null || other.min.compareTo(this.min) < 0 ? other.min : this.min;
    }
    if (other.max !== null) {
      this.max = this.max === null || other.max.compareTo(this.max) > 0 ? other.max : this.max;
    }
    this.last = other.last ?? this.last;
  }

  public result(): Nullable<string> {
    if (this.count === 0 && this.aggregation !== Aggregation.COUNT) {
      return null;
    }
    switch (this.aggregation) {
      case Aggregation.SUM:
      case Aggregation.NONE:
        return this.sum.toString();
      case Aggregation.COUNT:
        return String(this.count);
      case Aggregation.AVERAGE:
        return Accumulator.text(this.sum.divide(Decimal.fromInteger(this.count).unwrap()));
      case Aggregation.WEIGHTED_AVERAGE:
        return Accumulator.text(this.weightedSum.divide(this.weightTotal));
      case Aggregation.MIN:
        return this.min === null ? null : this.min.toString();
      case Aggregation.MAX:
        return this.max === null ? null : this.max.toString();
      case Aggregation.LAST:
        return this.last === null ? null : this.last.toString();
    }
  }

  private static text(result: Result<Decimal>): Nullable<string> {
    return result.match(
      (value: Decimal): Nullable<string> => value.toString(),
      (): Nullable<string> => null,
    );
  }
}
