import { Injectable } from '@nestjs/common';
import { Clock } from '@asisteglt/shared-kernel';
import { DeviceInfo, Session } from '../domain/session';
import {
  AccessTokenIssuer,
  AuthenticatedPrincipal,
  OpaqueTokenService,
  SessionRepository,
} from '../domain/ports';
import { User } from '../domain/user';
import { IamSettings } from './iam-settings';

/** Resultado de abrir o renovar una sesión. El refresh token solo sale hacia la cookie HttpOnly. */
export class IssuedSession {
  public constructor(
    public readonly accessToken: string,
    public readonly accessTokenTtlSeconds: number,
    public readonly refreshToken: string,
    public readonly user: User,
  ) {}
}

@Injectable()
export class SessionIssuer {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: OpaqueTokenService,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly settings: IamSettings,
    private readonly clock: Clock,
  ) {}

  public async open(user: User, device: DeviceInfo): Promise<IssuedSession> {
    const refreshToken: string = this.tokens.generate();
    const session: Session = Session.open(
      user.getId(),
      this.tokens.digest(refreshToken),
      device,
      this.settings.refreshTokenTtlMs,
      this.clock,
    );
    await this.sessions.save(session);
    return this.issue(user, session, refreshToken);
  }

  public async rotate(user: User, session: Session): Promise<IssuedSession> {
    const refreshToken: string = this.tokens.generate();
    session.rotate(this.tokens.digest(refreshToken), this.settings.refreshTokenTtlMs, this.clock);
    await this.sessions.save(session);
    return this.issue(user, session, refreshToken);
  }

  private async issue(user: User, session: Session, refreshToken: string): Promise<IssuedSession> {
    const principal: AuthenticatedPrincipal = new AuthenticatedPrincipal(
      user.getId(),
      session.getId(),
      user.getEmail().toString(),
    );
    return new IssuedSession(
      await this.accessTokens.issue(principal),
      this.accessTokens.ttlSeconds(),
      refreshToken,
      user,
    );
  }
}
