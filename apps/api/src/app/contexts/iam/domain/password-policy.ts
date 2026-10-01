import { Result } from '@asisteglt/shared-kernel';
import { IamErrors } from './iam-errors';

/** Contraseña en texto plano validada (nunca se persiste). */
export class PlainPassword {
  private static readonly MIN_LENGTH: number = 12;
  private static readonly MAX_LENGTH: number = 128;

  private constructor(public readonly value: string) {}

  public static create(raw: string): Result<PlainPassword> {
    const valid: boolean =
      raw.length >= PlainPassword.MIN_LENGTH &&
      raw.length <= PlainPassword.MAX_LENGTH &&
      /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(raw) &&
      /\d/.test(raw);
    return valid ? Result.ok(new PlainPassword(raw)) : Result.fail(IamErrors.weakPassword());
  }

  /** Para verificar credenciales no se aplica la política (se compara contra el hash). */
  public static forVerification(raw: string): PlainPassword {
    return new PlainPassword(raw);
  }
}
