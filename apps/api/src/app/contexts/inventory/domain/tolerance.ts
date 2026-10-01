import { InventoryErrorCode, ToleranceKind } from '@asisteglt/shared-contracts';
import { Decimal, Result, ValidationError } from '@asisteglt/shared-kernel';

/** Tolerancia de diferencia entre lo esperado y lo contado (absoluta o porcentual). */
export class Tolerance {
  private constructor(
    public readonly kind: ToleranceKind,
    public readonly value: Decimal,
  ) {}

  public static create(kind: ToleranceKind, raw: string): Result<Tolerance> {
    return Decimal.of(raw.trim()).flatMap((value: Decimal): Result<Tolerance> =>
      value.isNegative()
        ? Result.fail(
            new ValidationError(InventoryErrorCode.INVALID_COUNT, 'La tolerancia no puede ser negativa'),
          )
        : Result.ok(new Tolerance(kind, value)),
    );
  }

  public isExceededBy(expected: Decimal, counted: Decimal): boolean {
    const difference: Decimal = counted.subtract(expected).abs();
    if (this.kind === ToleranceKind.ABSOLUTE) {
      return difference.compareTo(this.value) > 0;
    }
    if (expected.isZero()) {
      return !difference.isZero();
    }
    const limit: Decimal = expected
      .abs()
      .multiply(this.value)
      .divide(Decimal.fromInteger(100).unwrap())
      .unwrap();
    return difference.compareTo(limit) > 0;
  }
}

/** Ubicación de almacén (`A-01-03`): la zona es el primer segmento. */
export class StorageLocation {
  public static segments(location: string): string[] {
    return location
      .trim()
      .toUpperCase()
      .split(/[-/.\s]+/)
      .filter((s: string): boolean => s.length > 0);
  }

  public static zoneOf(location: string): string {
    return StorageLocation.segments(location)[0] ?? 'SIN-ZONA';
  }

  public static compare(a: string, b: string): number {
    return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
  }
}
