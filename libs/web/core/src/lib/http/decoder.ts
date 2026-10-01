import { Result } from '@asisteglt/shared-kernel';

/** Convierte una respuesta JSON (`unknown`) en un tipo del frontend validado. */
export abstract class Decoder<T> {
  public abstract decode(value: unknown): Result<T>;
}
