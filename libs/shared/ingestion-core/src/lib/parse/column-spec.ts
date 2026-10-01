import { ColumnSpec, DataType, EmptyHandling, FieldRole, NumericNature } from '@asisteglt/shared-contracts';

export type { ColumnSpec, DerivedAttributeSpec, IdentifierMaskSpec } from '@asisteglt/shared-contracts';
export { DerivedAttributeKind } from '@asisteglt/shared-contracts';

/** Valores por defecto de formato según el tipo y la naturaleza del encabezado (docs/12 §2.3.1). */
export class ColumnDefaults {
  public static create(
    bandIndex: number,
    fieldKey: string,
    role: FieldRole,
    dataType: DataType,
    nature: NumericNature | null,
  ): ColumnSpec {
    const zeroWhenEmpty: boolean = nature === NumericNature.AMOUNT || nature === NumericNature.QUANTITY;
    return {
      bandIndex,
      fieldKey,
      role,
      dataType,
      nature,
      emptyHandling: zeroWhenEmpty ? EmptyHandling.ZERO : EmptyHandling.NO_VALUE,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      datePattern: 'dd/MM/yyyy',
      trueText: 'S',
      falseText: 'N',
    };
  }
}
