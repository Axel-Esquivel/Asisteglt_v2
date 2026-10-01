import { DataType, NumericNature } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { FieldInfo } from './field-resolver';

export enum ValueKind {
  NUMBER = 'NUMBER',
  TEXT = 'TEXT',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
}

/** Tipo de una expresión: clase de valor y, si es número, su naturaleza (`literal` = número escrito). */
export class ValueType {
  private constructor(
    public readonly kind: ValueKind,
    public readonly nature: Nullable<NumericNature>,
    public readonly literal: boolean,
    public readonly label: string,
  ) {}

  public static literal(): ValueType {
    return new ValueType(ValueKind.NUMBER, null, true, 'Número');
  }

  public static number(nature: NumericNature): ValueType {
    return new ValueType(ValueKind.NUMBER, nature, false, ValueType.natureLabel(nature));
  }

  public static text(): ValueType {
    return new ValueType(ValueKind.TEXT, null, false, 'Texto');
  }

  public static date(): ValueType {
    return new ValueType(ValueKind.DATE, null, false, 'Fecha');
  }

  public static boolean(): ValueType {
    return new ValueType(ValueKind.BOOLEAN, null, false, 'Sí/No');
  }

  public static ofField(field: FieldInfo): ValueType {
    switch (field.dataType) {
      case DataType.TEXT:
        return ValueType.text();
      case DataType.DATE:
        return ValueType.date();
      case DataType.BOOLEAN:
        return ValueType.boolean();
      case DataType.INTEGER:
      case DataType.DECIMAL:
        return new ValueType(
          ValueKind.NUMBER,
          field.nature ?? NumericNature.DESCRIPTIVE,
          false,
          field.dataType === DataType.INTEGER ? 'Número entero' : 'Número decimal',
        );
    }
  }

  public static natureLabel(nature: NumericNature): string {
    switch (nature) {
      case NumericNature.AMOUNT:
        return 'Monto';
      case NumericNature.QUANTITY:
        return 'Cantidad';
      case NumericNature.RATE:
        return 'Tasa';
      case NumericNature.UNIT_PRICE:
        return 'Precio unitario';
      case NumericNature.DESCRIPTIVE:
        return 'Número descriptivo';
    }
  }

  public isNumber(): boolean {
    return this.kind === ValueKind.NUMBER;
  }

  /** Nombre para mensajes: la naturaleza si es un número con naturaleza. */
  public describe(): string {
    return this.nature === null ? this.label : ValueType.natureLabel(this.nature);
  }
}
