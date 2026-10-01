import { CellValue } from '../parse/cell-value';
import { DerivedAttributeKind, DerivedAttributeSpec } from '../parse/column-spec';

/** Calcula un atributo derivado a partir del texto original de la columna de origen. */
export class DerivedAttributeCalculator {
  public constructor(private readonly spec: DerivedAttributeSpec) {}

  public get sourceKey(): string {
    return this.spec.sourceKey;
  }

  public get targetKey(): string {
    return this.spec.targetKey;
  }

  public derive(raw: string): CellValue {
    switch (this.spec.kind) {
      case DerivedAttributeKind.CODE_SEGMENTS_LEVEL:
        return String(this.significantSegments(raw.trim()));
      case DerivedAttributeKind.LEAF_FLAG: {
        const segments: string[] = this.segments(raw.trim());
        return segments.length > 0 && this.significantSegments(raw.trim()) === segments.length;
      }
      case DerivedAttributeKind.INDENTATION_LEVEL: {
        const leading: number = raw.length - raw.trimStart().length;
        const perLevel: number = Math.max(1, this.spec.spacesPerLevel);
        return String(Math.floor(leading / perLevel) + 1);
      }
    }
  }

  private segments(code: string): string[] {
    const separator: string = this.spec.separator.length === 0 ? '.' : this.spec.separator;
    return code.split(separator).filter((part: string): boolean => part.length > 0);
  }

  /** Segmentos hasta el primero formado solo por ceros (`1.001.000.0000` → 2). */
  private significantSegments(code: string): number {
    const segments: string[] = this.segments(code);
    const firstZero: number = segments.findIndex(
      (part: string, index: number): boolean => index > 0 && /^0+$/.test(part),
    );
    return firstZero < 0 ? segments.length : firstZero;
  }
}
