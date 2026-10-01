/** Contratos de identidad y sesiones (`/api/v1/auth`, `/api/v1/users`). */
export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface UserResponse {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: string;
}

/** Respuesta de login/refresh: el refresh token viaja solo en cookie HttpOnly. */
export interface AuthSessionResponse {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly user: UserResponse;
}

export interface UpdateProfileRequest {
  readonly displayName: string;
}

export interface ChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface SessionResponse {
  readonly id: string;
  readonly userAgent: string;
  readonly ipAddress: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly current: boolean;
}

export enum IamErrorCode {
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  INVALID_DISPLAY_NAME = 'INVALID_DISPLAY_NAME',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  REFRESH_TOKEN_REUSED = 'REFRESH_TOKEN_REUSED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
}
