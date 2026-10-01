import { CollectionFieldDto, CollectionRowDto, DataType, NumericNature } from '@asisteglt/shared-contracts';
import { FieldDecoder, FieldReader, Nullable } from '@asisteglt/shared-kernel';

const FIELD: FieldDecoder<CollectionFieldDto> = new FieldDecoder<CollectionFieldDto>(
  (f: FieldReader): CollectionFieldDto => ({
    key: f.string('key'),
    label: f.string('label'),
    dataType: f.oneOf('dataType', Object.values(DataType)),
    nature: f.raw('nature') === null ? null : f.oneOf('nature', Object.values(NumericNature)),
  }),
);

const ROW: FieldDecoder<CollectionRowDto> = new FieldDecoder<CollectionRowDto>(
  (f: FieldReader): CollectionRowDto => ({
    id: f.string('id'),
    period: f.nullableString('period'),
    values: CollectionView.values(f.raw('values')),
  }),
);

/** Colección complementaria tal como la devuelve la API. */
export class CollectionView {
  public constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly fields: CollectionFieldDto[],
    public readonly rows: CollectionRowDto[],
  ) {}

  public static decoder(): FieldDecoder<CollectionView> {
    return new FieldDecoder<CollectionView>(
      (f: FieldReader): CollectionView =>
        new CollectionView(f.string('id'), f.string('name'), f.list('fields', FIELD), f.list('rows', ROW)),
    );
  }

  public static values(raw: unknown): Record<string, string | boolean | null> {
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

  public field(key: Nullable<string>): Nullable<CollectionFieldDto> {
    return this.fields.find((f: CollectionFieldDto): boolean => f.key === key) ?? null;
  }

  public rateFields(): CollectionFieldDto[] {
    return this.fields.filter((f: CollectionFieldDto): boolean => f.nature === NumericNature.RATE);
  }

  public textFields(): CollectionFieldDto[] {
    return this.fields.filter((f: CollectionFieldDto): boolean => f.dataType === DataType.TEXT);
  }
}
