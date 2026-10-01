import { FieldInfo, ListFieldResolver } from '@asisteglt/shared-formula-engine';
import { CatalogField, FieldCatalog } from '../domain/field-catalog';

/** Adapta el catálogo de encabezados al `FieldResolver` del motor de fórmulas. */
export class CatalogResolver {
  public static of(catalog: FieldCatalog): ListFieldResolver {
    return new ListFieldResolver(
      catalog.all().map((field: CatalogField): FieldInfo => {
        const s = field.snapshot();
        return new FieldInfo(s.key, s.label, s.dataType, s.nature, s.aggregation, s.weightField, s.active);
      }),
    );
  }
}
