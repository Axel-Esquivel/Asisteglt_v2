import {
  Aggregation,
  CatalogTemplate,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
} from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { FieldDefinition } from '../domain/field-catalog';

interface TemplateField {
  readonly label: string;
  readonly origin: FieldOrigin;
  readonly role: FieldRole;
  readonly dataType: DataType;
  readonly nature: Nullable<NumericNature>;
  readonly describesLabel: Nullable<string>;
  readonly weightLabel: Nullable<string>;
}

/** Plantillas opcionales del catálogo (solo listas precargadas; docs/12 §2.4). */
export class CatalogTemplates {
  public static fields(template: CatalogTemplate): ReadonlyArray<TemplateField> {
    const field = (
      label: string,
      role: FieldRole,
      dataType: DataType,
      nature: Nullable<NumericNature>,
      describesLabel: Nullable<string>,
      weightLabel: Nullable<string>,
      origin: FieldOrigin,
    ): TemplateField => ({ label, role, dataType, nature, describesLabel, weightLabel, origin });
    const I: FieldOrigin = FieldOrigin.IMPORTED;
    const D: FieldOrigin = FieldOrigin.DERIVED;
    switch (template) {
      case CatalogTemplate.ACCOUNTING:
        return [
          field('Código de cuenta', FieldRole.IDENTIFIER, DataType.TEXT, null, null, null, I),
          field(
            'Nombre de cuenta',
            FieldRole.IDENTIFIER_NAME,
            DataType.TEXT,
            null,
            'Código de cuenta',
            null,
            I,
          ),
          field('Saldo anterior', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null, null, I),
          field('Debe', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null, null, I),
          field('Haber', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null, null, I),
          field('Saldo actual', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null, null, I),
          field(
            'Nivel de cuenta',
            FieldRole.DATA,
            DataType.INTEGER,
            NumericNature.DESCRIPTIVE,
            null,
            null,
            D,
          ),
          field('Es cuenta de detalle', FieldRole.DATA, DataType.BOOLEAN, null, null, null, D),
        ];
      case CatalogTemplate.SALES:
        return [
          field('Código de producto', FieldRole.IDENTIFIER, DataType.TEXT, null, null, null, I),
          field(
            'Descripción del producto',
            FieldRole.IDENTIFIER_NAME,
            DataType.TEXT,
            null,
            'Código de producto',
            null,
            I,
          ),
          field('Código de tienda', FieldRole.IDENTIFIER, DataType.TEXT, null, null, null, I),
          field('Vendedor', FieldRole.DATA, DataType.TEXT, null, null, null, I),
          field('Fecha de venta', FieldRole.DATA, DataType.DATE, null, null, null, I),
          field('Unidades vendidas', FieldRole.DATA, DataType.INTEGER, NumericNature.QUANTITY, null, null, I),
          field('Monto de venta', FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT, null, null, I),
          field(
            'Precio unitario',
            FieldRole.DATA,
            DataType.DECIMAL,
            NumericNature.UNIT_PRICE,
            null,
            'Unidades vendidas',
            I,
          ),
          field(
            '% de descuento',
            FieldRole.DATA,
            DataType.DECIMAL,
            NumericNature.RATE,
            null,
            'Monto de venta',
            I,
          ),
        ];
    }
  }

  /** Traduce los nombres de referencia (describe / ponderado por) a claves ya existentes. */
  public static definition(
    field: TemplateField,
    keyOf: (label: string) => Nullable<string>,
  ): FieldDefinition {
    return {
      label: field.label,
      origin: field.origin,
      role: field.role,
      dataType: field.dataType,
      nature: field.nature,
      aggregation: field.weightLabel === null ? null : Aggregation.WEIGHTED_AVERAGE,
      describes: field.describesLabel === null ? null : keyOf(field.describesLabel),
      weightField: field.weightLabel === null ? null : keyOf(field.weightLabel),
    };
  }
}
