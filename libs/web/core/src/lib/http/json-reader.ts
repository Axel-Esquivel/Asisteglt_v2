import { Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';

/** Lee campos de un JSON recibido como `unknown`, validando cada tipo. */
export class JsonReader {
  private constructor(private readonly source: Readonly<Record<string, unknown>>) {}

  public static from(value: unknown): Result<JsonReader> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return Result.fail(new ValidationError('INVALID_JSON_OBJECT', 'Se esperaba un objeto JSON'));
    }
    const entries: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      entries[key] = item;
    }
    return Result.ok(new JsonReader(entries));
  }

  public string(key: string): Result<string> {
    const value: unknown = this.get(key);
    return typeof value === 'string' ? Result.ok(value) : this.invalid(key, 'texto');
  }

  public number(key: string): Result<number> {
    const value: unknown = this.get(key);
    return typeof value === 'number' && Number.isFinite(value) ? Result.ok(value) : this.invalid(key, 'número');
  }

  public oneOf<T extends string>(key: string, allowed: ReadonlyArray<T>): Result<T> {
    const value: unknown = this.get(key);
    const match: Nullable<T> = allowed.find((candidate: T): boolean => candidate === value) ?? null;
    return match === null ? this.invalid(key, `uno de ${allowed.join(', ')}`) : Result.ok(match);
  }

  private get(key: string): unknown {
    return Object.prototype.hasOwnProperty.call(this.source, key) ? this.source[key] : null;
  }

  private invalid<T>(key: string, expected: string): Result<T> {
    return Result.fail(new ValidationError('INVALID_JSON_FIELD', `El campo «${key}» debe ser ${expected}`));
  }
}
