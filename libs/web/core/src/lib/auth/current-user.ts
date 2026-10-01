import { Decoder, JsonReader, Result } from '@asisteglt/shared-kernel';

/** Usuario autenticado (modelo de vista). */
export class CurrentUser {
  public constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly displayName: string,
    public readonly createdAt: Date,
  ) {}

  public initials(): string {
    return this.displayName
      .split(' ')
      .filter((part: string): boolean => part.length > 0)
      .slice(0, 2)
      .map((part: string): string => part.charAt(0).toUpperCase())
      .join('');
  }
}

export class CurrentUserDecoder extends Decoder<CurrentUser> {
  public override decode(value: unknown): Result<CurrentUser> {
    return JsonReader.from(value).flatMap((json: JsonReader): Result<CurrentUser> =>
      json
        .string('id')
        .flatMap((id: string): Result<CurrentUser> =>
          json
            .string('email')
            .flatMap((email: string): Result<CurrentUser> =>
              json
                .string('displayName')
                .flatMap((displayName: string): Result<CurrentUser> =>
                  json
                    .date('createdAt')
                    .map(
                      (createdAt: Date): CurrentUser => new CurrentUser(id, email, displayName, createdAt),
                    ),
                ),
            ),
        ),
    );
  }
}

/** Respuesta de login/registro/refresh. */
export class AuthGrant {
  public constructor(
    public readonly accessToken: string,
    public readonly expiresInSeconds: number,
    public readonly user: CurrentUser,
  ) {}
}

export class AuthGrantDecoder extends Decoder<AuthGrant> {
  private readonly users: CurrentUserDecoder = new CurrentUserDecoder();

  public override decode(value: unknown): Result<AuthGrant> {
    return JsonReader.from(value).flatMap((json: JsonReader): Result<AuthGrant> =>
      json
        .string('accessToken')
        .flatMap((token: string): Result<AuthGrant> =>
          json
            .number('expiresInSeconds')
            .flatMap((ttl: number): Result<AuthGrant> =>
              this.users
                .decode(json.raw('user'))
                .map((user: CurrentUser): AuthGrant => new AuthGrant(token, ttl, user)),
            ),
        ),
    );
  }
}

/** Sesión activa del usuario en un dispositivo. */
export class ActiveSession {
  public constructor(
    public readonly id: string,
    public readonly userAgent: string,
    public readonly ipAddress: string,
    public readonly createdAt: Date,
    public readonly lastSeenAt: Date,
    public readonly current: boolean,
  ) {}

  public deviceLabel(): string {
    const agent: string = this.userAgent.toLowerCase();
    const browser: string = agent.includes('firefox')
      ? 'Firefox'
      : agent.includes('edg/')
        ? 'Edge'
        : agent.includes('chrome')
          ? 'Chrome'
          : agent.includes('safari')
            ? 'Safari'
            : 'Navegador';
    const system: string = agent.includes('android')
      ? 'Android'
      : agent.includes('iphone') || agent.includes('ipad')
        ? 'iOS'
        : agent.includes('windows')
          ? 'Windows'
          : agent.includes('mac os')
            ? 'macOS'
            : agent.includes('linux')
              ? 'Linux'
              : 'otro sistema';
    return `${browser} en ${system}`;
  }
}

export class ActiveSessionDecoder extends Decoder<ActiveSession> {
  public override decode(value: unknown): Result<ActiveSession> {
    return JsonReader.from(value).flatMap((json: JsonReader): Result<ActiveSession> =>
      json
        .string('id')
        .flatMap((id: string): Result<ActiveSession> =>
          json
            .string('userAgent')
            .flatMap((agent: string): Result<ActiveSession> =>
              json
                .string('ipAddress')
                .flatMap((ip: string): Result<ActiveSession> =>
                  json
                    .date('createdAt')
                    .flatMap((created: Date): Result<ActiveSession> =>
                      json
                        .date('lastSeenAt')
                        .flatMap((seen: Date): Result<ActiveSession> =>
                          json
                            .boolean('current')
                            .map(
                              (current: boolean): ActiveSession =>
                                new ActiveSession(id, agent, ip, created, seen, current),
                            ),
                        ),
                    ),
                ),
            ),
        ),
    );
  }
}
