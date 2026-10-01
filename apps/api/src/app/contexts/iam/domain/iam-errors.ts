import { IamErrorCode } from '@asisteglt/shared-contracts';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@asisteglt/shared-kernel';

/** Fábrica de errores del contexto de identidad (mensajes en español, códigos estables). */
export class IamErrors {
  public static emailTaken(): ConflictError {
    return new ConflictError(IamErrorCode.EMAIL_ALREADY_REGISTERED, 'Ya existe una cuenta con ese correo');
  }

  public static invalidCredentials(): UnauthorizedError {
    return new UnauthorizedError(IamErrorCode.INVALID_CREDENTIALS, 'Correo o contraseña incorrectos');
  }

  public static accountLocked(until: Date): UnauthorizedError {
    return new UnauthorizedError(
      IamErrorCode.ACCOUNT_LOCKED,
      `Cuenta bloqueada temporalmente por intentos fallidos hasta ${until.toISOString()}`,
    );
  }

  public static weakPassword(): ValidationError {
    return new ValidationError(
      IamErrorCode.WEAK_PASSWORD,
      'La contraseña debe tener al menos 12 caracteres e incluir letras y números',
    );
  }

  public static invalidDisplayName(): ValidationError {
    return new ValidationError(
      IamErrorCode.INVALID_DISPLAY_NAME,
      'El nombre debe tener entre 2 y 80 caracteres',
    );
  }

  public static sessionExpired(): UnauthorizedError {
    return new UnauthorizedError(IamErrorCode.SESSION_EXPIRED, 'La sesión expiró; inicia sesión de nuevo');
  }

  public static refreshTokenReused(): UnauthorizedError {
    return new UnauthorizedError(
      IamErrorCode.REFRESH_TOKEN_REUSED,
      'Se detectó la reutilización de la sesión; por seguridad se cerró',
    );
  }

  public static unauthenticated(): UnauthorizedError {
    return new UnauthorizedError(IamErrorCode.UNAUTHENTICATED, 'Debes iniciar sesión');
  }

  public static sessionNotFound(): NotFoundError {
    return new NotFoundError(IamErrorCode.SESSION_NOT_FOUND, 'La sesión no existe');
  }
}
