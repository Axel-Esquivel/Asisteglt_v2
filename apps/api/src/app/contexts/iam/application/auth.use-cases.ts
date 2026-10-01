import { Injectable } from '@nestjs/common';
import { Clock, Email, Nullable, Optional, Result } from '@asisteglt/shared-kernel';
import { IamErrors } from '../domain/iam-errors';
import { LockoutPolicy } from '../domain/lockout-policy';
import { PlainPassword } from '../domain/password-policy';
import { PasswordHasher, OpaqueTokenService, SessionRepository, UserRepository } from '../domain/ports';
import { DeviceInfo, Session } from '../domain/session';
import { User } from '../domain/user';
import { LoginCommand, RegisterCommand } from './commands';
import { IssuedSession, SessionIssuer } from './session-issuer';

@Injectable()
export class RegisterUserUseCase {
  public constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly issuer: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  public async execute(command: RegisterCommand, device: DeviceInfo): Promise<Result<IssuedSession>> {
    const email: Result<Email> = Email.create(command.email);
    const password: Result<PlainPassword> = PlainPassword.create(command.password);
    const emailError = email.errorOrNull();
    if (emailError !== null) {
      return Result.fail(emailError);
    }
    const passwordError = password.errorOrNull();
    if (passwordError !== null) {
      return Result.fail(passwordError);
    }
    const existing: Optional<User> = await this.users.findByEmail(email.unwrap());
    if (existing.isPresent()) {
      return Result.fail(IamErrors.emailTaken());
    }
    const hash: string = await this.hasher.hash(password.unwrap());
    const created: Result<User> = User.register(email.unwrap(), hash, command.displayName, this.clock);
    const createdError = created.errorOrNull();
    if (createdError !== null) {
      return Result.fail(createdError);
    }
    const user: User = created.unwrap();
    user.recordSuccessfulLogin(this.clock);
    await this.users.save(user);
    return Result.ok(await this.issuer.open(user, device));
  }
}

@Injectable()
export class LoginUseCase {
  private readonly policy: LockoutPolicy = LockoutPolicy.standard();

  public constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly issuer: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  public async execute(command: LoginCommand): Promise<Result<IssuedSession>> {
    const email: Result<Email> = Email.create(command.email);
    if (!email.isOk()) {
      return Result.fail(IamErrors.invalidCredentials());
    }
    const found: Nullable<User> = (await this.users.findByEmail(email.unwrap())).toNullable();
    if (found === null || !found.isActive()) {
      return Result.fail(IamErrors.invalidCredentials());
    }
    const lockedUntil: Nullable<Date> = found.lockedUntilAt(this.clock);
    if (lockedUntil !== null) {
      return Result.fail(IamErrors.accountLocked(lockedUntil));
    }
    const valid: boolean = await this.hasher.verify(
      PlainPassword.forVerification(command.password),
      found.getPasswordHash(),
    );
    if (!valid) {
      found.recordFailedLogin(this.policy, this.clock);
      await this.users.save(found);
      const nowLocked: Nullable<Date> = found.lockedUntilAt(this.clock);
      return Result.fail(
        nowLocked === null ? IamErrors.invalidCredentials() : IamErrors.accountLocked(nowLocked),
      );
    }
    found.recordSuccessfulLogin(this.clock);
    await this.users.save(found);
    return Result.ok(await this.issuer.open(found, command.device));
  }
}

@Injectable()
export class RefreshSessionUseCase {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly tokens: OpaqueTokenService,
    private readonly issuer: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  public async execute(rawRefreshToken: string): Promise<Result<IssuedSession>> {
    const hash: string = this.tokens.digest(rawRefreshToken);
    const session: Nullable<Session> = (await this.sessions.findByAnyTokenHash(hash)).toNullable();
    if (session === null || !session.isActive(this.clock)) {
      return Result.fail(IamErrors.sessionExpired());
    }
    if (session.wasTokenAlreadyUsed(hash)) {
      session.revoke(this.clock);
      await this.sessions.save(session);
      return Result.fail(IamErrors.refreshTokenReused());
    }
    const user: Nullable<User> = (await this.users.findById(session.getUserId())).toNullable();
    if (user === null || !user.isActive()) {
      return Result.fail(IamErrors.sessionExpired());
    }
    return Result.ok(await this.issuer.rotate(user, session));
  }
}

@Injectable()
export class LogoutUseCase {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: OpaqueTokenService,
    private readonly clock: Clock,
  ) {}

  public async execute(rawRefreshToken: string): Promise<void> {
    const session: Nullable<Session> = (
      await this.sessions.findByAnyTokenHash(this.tokens.digest(rawRefreshToken))
    ).toNullable();
    if (session !== null) {
      session.revoke(this.clock);
      await this.sessions.save(session);
    }
  }
}
