import {
  CollectionFieldDto,
  CollectionRequest,
  CollectionRowDto,
  DataType,
  NumericNature,
} from '@asisteglt/shared-contracts';
import { Decoder, FieldDecoder, FieldReader, Result } from '@asisteglt/shared-kernel';

/** Validación del cuerpo JSON de una colección complementaria. */
export class CollectionsParsers {
  private static readonly FIELD: Decoder<CollectionFieldDto> = new FieldDecoder<CollectionFieldDto>(
    (f: FieldReader): CollectionFieldDto => ({
      key: f.string('key'),
      label: f.string('label'),
      dataType: f.oneOf('dataType', Object.values(DataType)),
      nature: f.raw('nature') === null ? null : f.oneOf('nature', Object.values(NumericNature)),
    }),
  );

  private static readonly ROW: Decoder<CollectionRowDto> = new FieldDecoder<CollectionRowDto>(
    (f: FieldReader): CollectionRowDto => ({
      id: f.string('id'),
      period: f.nullableString('period'),
      values: CollectionsParsers.values(f.raw('values')),
    }),
  );

  private static readonly REQUEST: Decoder<CollectionRequest> = new FieldDecoder<CollectionRequest>(
    (f: FieldReader): CollectionRequest => ({
      name: f.string('name'),
      fields: f.list('fields', CollectionsParsers.FIELD),
      rows: f.list('rows', CollectionsParsers.ROW),
    }),
  );

  public static request(body: unknown): Result<CollectionRequest> {
    return CollectionsParsers.REQUEST.decode(body);
  }

  /** Solo texto, sí/no o vacío; el agregado valida cada valor contra el tipo de su campo. */
  private static values(raw: unknown): Record<string, string | boolean | null> {
    const values: Record<string, string | boolean | null> = {};
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return values;
    }
    for (const key of Object.keys(raw)) {
      const value: unknown = Reflect.get(raw, key);
      if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
        values[key] = value;
      }
    }
    return values;
  }
}
