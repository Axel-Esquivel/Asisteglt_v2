import { Result } from '../core/result';
import { ValidationError } from '../errors/domain-error';
import { ValueObject } from '../domain/value-object';

/** Correo electrónico normalizado (minúsculas, sin espacios). */
export class Email extends ValueObject {
  private static readonly PATTERN: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  private static readonly MAX_LENGTH: number = 254;

  private constructor(private readonly value: string) {
    super();
  }

  public static create(raw: string): Result<Email> {
    const value: string = raw.trim().toLowerCase();
    if (value.length > Email.MAX_LENGTH || !Email.PATTERN.test(value)) {
      return Result.fail(new ValidationError('INVALID_EMAIL', 'El correo electrónico no es válido'));
    }
    return Result.ok(new Email(value));
  }

  public override toString(): string {
    return this.value;
  }

  protected override equalityKey(): string {
    return this.value;
  }
}
