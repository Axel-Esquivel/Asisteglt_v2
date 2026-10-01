import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EntityId, Result } from '@asisteglt/shared-kernel';
import * as argon2 from 'argon2';
import { IamErrors } from '../domain/iam-errors';
import { PlainPassword } from '../domain/password-policy';
import { AccessTokenIssuer, AuthenticatedPrincipal, OpaqueTokenService, PasswordHasher } from '../domain/ports';

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  public override hash(password: PlainPassword): Promise<string> {
    return argon2.hash(password.value, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2 });
  }

  public override async verify(password: PlainPassword, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password.value);
    } catch {
      return false;
    }
  }
}

@Injectable()
export class CryptoOpaqueTokenService extends OpaqueTokenService {
  public override generate(): string {
    return randomBytes(32).toString('base64url');
  }

  public override digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/** Configuración del emisor de access tokens. */
export class AccessTokenSettings {
  public constructor(
    public readonly secret: string,
    public readonly ttlSeconds: number,
  ) {}
}

/** Access token JWT (HS256) de vida corta: `sub` = usuario, `sid` = sesión. */
@Injectable()
export class JwtAccessTokenIssuer extends AccessTokenIssuer {
  public constructor(
    private readonly jwt: JwtService,
    private readonly settings: AccessTokenSettings,
  ) {
    super();
  }

  public override issue(principal: AuthenticatedPrincipal): Promise<string> {
    return this.jwt.signAsync(
      { sub: principal.userId.toString(), sid: principal.sessionId.toString(), email: principal.email },
      { secret: this.settings.secret, expiresIn: this.settings.ttlSeconds, algorithm: 'HS256' },
    );
  }

  public override async verify(token: string): Promise<Result<AuthenticatedPrincipal>> {
    try {
      const payload: unknown = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.settings.secret,
        algorithms: ['HS256'],
      });
      return JwtAccessTokenIssuer.toPrincipal(payload);
    } catch {
      return Result.fail(IamErrors.unauthenticated());
    }
  }

  public override ttlSeconds(): number {
    return this.settings.ttlSeconds;
  }

  private static toPrincipal(payload: unknown): Result<AuthenticatedPrincipal> {
    if (typeof payload !== 'object' || payload === null) {
      return Result.fail(IamErrors.unauthenticated());
    }
    const sub: unknown = 'sub' in payload ? payload.sub : null;
    const sid: unknown = 'sid' in payload ? payload.sid : null;
    const email: unknown = 'email' in payload ? payload.email : null;
    if (typeof sub !== 'string' || typeof sid !== 'string' || typeof email !== 'string') {
      return Result.fail(IamErrors.unauthenticated());
    }
    return EntityId.fromString(sub).flatMap(
      (userId: EntityId): Result<AuthenticatedPrincipal> =>
        EntityId.fromString(sid).map((sessionId: EntityId): AuthenticatedPrincipal => new AuthenticatedPrincipal(userId, sessionId, email)),
    );
  }
}
