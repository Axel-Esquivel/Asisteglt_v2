import { Nullable } from '../core/nullable';
import { Result } from '../core/result';
import { DomainError, ValidationError } from '../errors/domain-error';
import { Decoder } from './decoder';
import { JsonReader } from './json-reader';

/**
 * Lectura directa de campos: cada método devuelve el valor validado o interrumpe la
 * decodificación. `FieldReader.decode` convierte la interrupción en `Result.fail`.
 */
export class FieldReader {
  private constructor(private readonly json: JsonReader) {}

  public static decode<T>(value: unknown, build: (fields: FieldReader) => T): Result<T> {
    return JsonReader.from(value).flatMap((json: JsonReader): Result<T> => {
      try {
        return Result.ok(build(new FieldReader(json)));
      } catch (error: unknown) {
        if (error instanceof DomainError) {
          return Result.fail<T>(error);
        }
        throw error;
      }
    });
  }

  public string(key: string): string {
    return this.json.string(key).unwrap();
  }

  public number(key: string): number {
    return this.json.number(key).unwrap();
  }

  public boolean(key: string): boolean {
    return this.json.boolean(key).unwrap();
  }

  public date(key: string): Date {
    return this.json.date(key).unwrap();
  }

  public nullableString(key: string): Nullable<string> {
    return this.json.nullableString(key).unwrap();
  }

  public nullableNumber(key: string): Nullable<number> {
    const value: unknown = this.json.raw(key);
    return value === null ? null : this.number(key);
  }

  public nullableDate(key: string): Nullable<Date> {
    return this.json.raw(key) === null ? null : this.date(key);
  }

  public oneOf<T extends string>(key: string, allowed: ReadonlyArray<T>): T {
    return this.json.oneOf(key, allowed).unwrap();
  }

  public nested<T>(key: string, decoder: Decoder<T>): T {
    return decoder.decode(this.json.raw(key)).unwrap();
  }

  public list<T>(key: string, decoder: Decoder<T>): T[] {
    const value: unknown = this.json.raw(key);
    if (!Array.isArray(value)) {
      throw new ValidationError('INVALID_JSON_FIELD', `El campo «${key}» debe ser una lista`);
    }
    const items: unknown[] = value;
    return Result.all(items.map((item: unknown): Result<T> => decoder.decode(item))).unwrap();
  }

  public stringList(key: string): string[] {
    return this.list(key, new StringDecoder());
  }

  public oneOfList<T extends string>(key: string, allowed: ReadonlyArray<T>): T[] {
    return this.list(key, new EnumDecoder<T>(allowed));
  }

  public raw(key: string): unknown {
    return this.json.raw(key);
  }
}

export class StringDecoder extends Decoder<string> {
  public override decode(value: unknown): Result<string> {
    return typeof value === 'string'
      ? Result.ok(value)
      : Result.fail(new ValidationError('INVALID_JSON_FIELD', 'Se esperaba texto'));
  }
}

export class NumberDecoder extends Decoder<number> {
  public override decode(value: unknown): Result<number> {
    return typeof value === 'number' && Number.isFinite(value)
      ? Result.ok(value)
      : Result.fail(new ValidationError('INVALID_JSON_FIELD', 'Se esperaba un número'));
  }
}

export class EnumDecoder<T extends string> extends Decoder<T> {
  public constructor(private readonly allowed: ReadonlyArray<T>) {
    super();
  }

  public override decode(value: unknown): Result<T> {
    const match: Nullable<T> = this.allowed.find((candidate: T): boolean => candidate === value) ?? null;
    return match === null
      ? Result.fail(
          new ValidationError('INVALID_JSON_FIELD', `Se esperaba uno de ${this.allowed.join(', ')}`),
        )
      : Result.ok(match);
  }
}

/** Decoder construido a partir de una función de lectura de campos. */
export class FieldDecoder<T> extends Decoder<T> {
  public constructor(private readonly build: (fields: FieldReader) => T) {
    super();
  }

  public override decode(value: unknown): Result<T> {
    return FieldReader.decode(value, this.build);
  }
}
