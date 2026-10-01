import { Result, ValidationError } from '@asisteglt/shared-kernel';

/** Convierte una respuesta JSON (`unknown`) en un tipo del frontend validado. */
export abstract class Decoder<T> {
  public abstract decode(value: unknown): Result<T>;
}

/** Decoder para respuestas sin cuerpo (204). */
export class EmptyDecoder extends Decoder<true> {
  public override decode(_value: unknown): Result<true> {
    return Result.ok(true);
  }
}

/** Decodifica un arreglo aplicando el decoder de cada elemento. */
export class ArrayDecoder<T> extends Decoder<T[]> {
  public constructor(private readonly item: Decoder<T>) {
    super();
  }

  public override decode(value: unknown): Result<T[]> {
    if (!Array.isArray(value)) {
      return Result.fail(new ValidationError('INVALID_JSON_ARRAY', 'Se esperaba una lista'));
    }
    const items: unknown[] = value;
    return Result.all(items.map((entry: unknown): Result<T> => this.item.decode(entry)));
  }
}
