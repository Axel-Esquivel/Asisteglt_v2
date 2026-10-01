import { Injectable } from '@nestjs/common';
import { Clock, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { IamErrors } from '../domain/iam-errors';
import { PlainPassword } from '../domain/password-policy';
import { AuthenticatedPrincipal, PasswordHasher, SessionRepository, UserRepository } from '../domain/ports';
import { Session } from '../domain/session';
import { User } from '../domain/user';

/** Casos de uso sobre la cuenta del usuario autenticado. */
@Injectable()
export class AccountService {
  public constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  public async current(principal: AuthenticatedPrincipal): Promise<Result<User>> {
    const user: Nullable<User> = (await this.users.findById(principal.userId)).toNullable();
    return user === null ? Result.fail(IamErrors.unauthenticated()) : Result.ok(user);
  }

  public async rename(principal: AuthenticatedPrincipal, displayName: string): Promise<Result<User>> {
    const current: Result<User> = await this.current(principal);
    const renamed: Result<User> = current.flatMap((user: User): Result<User> => user.rename(displayName));
    if (renamed.isOk()) {
      await this.users.save(renamed.unwrap());
    }
    return renamed;
  }

  /** Cambia la contraseña y cierra todas las demás sesiones del usuario. */
  public async changePassword(
    principal: AuthenticatedPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<Result<User>> {
    const current: Result<User> = await this.current(principal);
    const currentError = current.errorOrNull();
    if (currentError !== null) {
      return Result.fail(currentError);
    }
    const user: User = current.unwrap();
    if (!(await this.hasher.verify(PlainPassword.forVerification(currentPassword), user.getPasswordHash()))) {
      return Result.fail(IamErrors.invalidCredentials());
    }
    const next: Result<PlainPassword> = PlainPassword.create(newPassword);
    const nextError = next.errorOrNull();
    if (nextError !== null) {
      return Result.fail(nextError);
    }
    user.changePassword(await this.hasher.hash(next.unwrap()));
    await this.users.save(user);
    for (const session of await this.sessions.findByUser(user.getId())) {
      if (!session.getId().equals(principal.sessionId)) {
        session.revoke(this.clock);
        await this.sessions.save(session);
      }
    }
    return Result.ok(user);
  }

  public async activeSessions(principal: AuthenticatedPrincipal): Promise<Session[]> {
    return (await this.sessions.findByUser(principal.userId)).filter((s: Session): boolean => s.isActive(this.clock));
  }

  public async revokeSession(principal: AuthenticatedPrincipal, sessionId: EntityId): Promise<Result<Session>> {
    const session: Nullable<Session> = (await this.sessions.findById(sessionId)).toNullable();
    if (session === null || !session.getUserId().equals(principal.userId)) {
      return Result.fail(IamErrors.sessionNotFound());
    }
    session.revoke(this.clock);
    await this.sessions.save(session);
    return Result.ok(session);
  }

  public async isSessionActive(sessionId: EntityId): Promise<boolean> {
    const session: Nullable<Session> = (await this.sessions.findById(sessionId)).toNullable();
    return session !== null && session.isActive(this.clock);
  }
}
