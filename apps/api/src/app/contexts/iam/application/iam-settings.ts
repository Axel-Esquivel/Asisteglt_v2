/** Parámetros de sesión del contexto de identidad. */
export class IamSettings {
  public constructor(
    public readonly refreshTokenTtlMs: number,
    public readonly secureCookies: boolean,
  ) {}
}
