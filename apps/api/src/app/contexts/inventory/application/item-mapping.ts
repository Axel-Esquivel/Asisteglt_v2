import {
  DataType,
  InventoryErrorCode,
  InventoryItemRequest,
  ItemFieldMapping,
  NumericNature,
} from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CatalogField, FieldCatalog } from '../../reports/domain/field-catalog';

/**
 * Mapeo de encabezados del catálogo (por su nombre en pantalla, guardados por clave) a los
 * campos de un ítem de inventario. Cada campo exige un tipo y, si es número, una naturaleza.
 */
export class ItemMappingRules {
  private constructor(private readonly mapping: ItemFieldMapping) {}

  public static validate(mapping: ItemFieldMapping, catalog: FieldCatalog): Result<ItemMappingRules> {
    const field = (key: string): Nullable<CatalogField> => {
      const found: Nullable<CatalogField> = catalog.find(key).toNullable();
      return found !== null && found.isActive() ? found : null;
    };
    const text = (key: Nullable<string>, role: string, allowInteger: boolean): Nullable<ValidationError> => {
      if (key === null) {
        return null;
      }
      const f: Nullable<CatalogField> = field(key);
      const type: Nullable<DataType> = f === null ? null : f.snapshot().dataType;
      return type === DataType.TEXT || (allowInteger && type === DataType.INTEGER)
        ? null
        : ItemMappingRules.error(
            InventoryErrorCode.INVALID_MAPPING,
            `${role}: elige un encabezado de texto activo`,
          );
    };
    const number = (
      key: Nullable<string>,
      role: string,
      nature: Nullable<NumericNature>,
    ): Nullable<ValidationError> => {
      if (key === null) {
        return null;
      }
      const f: Nullable<CatalogField> = field(key);
      if (f === null || !f.isNumeric()) {
        return ItemMappingRules.error(
          InventoryErrorCode.INVALID_MAPPING,
          `${role}: elige un encabezado numérico activo`,
        );
      }
      return nature !== null && f.snapshot().nature !== nature
        ? ItemMappingRules.error(
            InventoryErrorCode.FIELD_NATURE_MISMATCH,
            `${role}: «${f.label}» no es ${nature === NumericNature.QUANTITY ? 'una Cantidad' : 'un Precio unitario'}`,
          )
        : null;
    };
    const errors: Array<Nullable<ValidationError>> = [
      text(mapping.sku, 'SKU', true),
      text(mapping.description, 'Descripción', false),
      text(mapping.unit, 'Unidad', false),
      text(mapping.location, 'Ubicación', false),
      number(mapping.expected, 'Existencia', NumericNature.QUANTITY),
      number(mapping.unitCost, 'Costo unitario', NumericNature.UNIT_PRICE),
      number(mapping.x, 'Coordenada X', null),
      number(mapping.y, 'Coordenada Y', null),
    ];
    const first: Nullable<ValidationError> =
      errors.find((e: Nullable<ValidationError>): e is ValidationError => e !== null) ?? null;
    return first === null ? Result.ok(new ItemMappingRules(mapping)) : Result.fail(first);
  }

  /** Ítem de un registro; `null` si no tiene SKU. Una existencia vacía cuenta como 0. */
  public item(values: Readonly<Record<string, CellValue>>): Nullable<InventoryItemRequest> {
    const read = (key: Nullable<string>): string => {
      const value: CellValue = key === null ? null : (values[key] ?? null);
      return typeof value === 'string' ? value.trim() : '';
    };
    const optional = (key: Nullable<string>): Nullable<string> => (read(key) === '' ? null : read(key));
    const sku: string = read(this.mapping.sku);
    if (sku === '') {
      return null;
    }
    return {
      sku,
      description: read(this.mapping.description),
      unit: read(this.mapping.unit),
      location: read(this.mapping.location),
      expectedQuantity: read(this.mapping.expected) === '' ? '0' : read(this.mapping.expected),
      unitCost: optional(this.mapping.unitCost),
      x: optional(this.mapping.x),
      y: optional(this.mapping.y),
    };
  }

  private static error(code: InventoryErrorCode, message: string): ValidationError {
    return new ValidationError(code, message);
  }
}
