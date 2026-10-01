import { AggregateRoot, Clock, Email, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { IamErrors } from './iam-errors';
import { LockoutPolicy } from './lockout-policy';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

/** Estado persistible del usuario (lo usan los mappers de infraestructura). */
export interface UserSnapshot {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly failedLoginAttempts: number;
  readonly lockoutCount: number;
  readonly lockedUntil: Nullable<Date>;
  readonly createdAt: Date;
  readonly lastLoginAt: Nullable<Date>;
}

/** Usuario de la plataforma. Encapsula credenciales y la política de bloqueo. */
export class User extends AggregateRoot {
  private constructor(
    id: EntityId,
    private readonly email: Email,
    private passwordHash: string,
    private displayName: string,
    private readonly status: UserStatus,
    private failedLoginAttempts: number,
    private lockoutCount: number,
    private lockedUntil: Nullable<Date>,
    private readonly createdAt: Date,
    private lastLoginAt: Nullable<Date>,
  ) {
    super(id);
  }

  public static register(
    email: Email,
    passwordHash: string,
    displayName: string,
    clock: Clock,
  ): Result<User> {
    return User.validateDisplayName(displayName).map(
      (name: string): User =>
        new User(
          EntityId.generate(),
          email,
          passwordHash,
          name,
          UserStatus.ACTIVE,
          0,
          0,
          null,
          clock.now(),
          null,
        ),
    );
  }

  public static restore(snapshot: UserSnapshot): User {
    return new User(
      EntityId.fromString(snapshot.id).unwrap(),
      Email.create(snapshot.email).unwrap(),
      snapshot.passwordHash,
      snapshot.displayName,
      snapshot.status,
      snapshot.failedLoginAttempts,
      snapshot.lockoutCount,
      snapshot.lockedUntil,
      snapshot.createdAt,
      snapshot.lastLoginAt,
    );
  }

  private static validateDisplayName(raw: string): Result<string> {
    const name: string = raw.trim().replace(/\s+/g, ' ');
    return name.length >= 2 && name.length <= 80
      ? Result.ok(name)
      : Result.fail(IamErrors.invalidDisplayName());
  }

  public getEmail(): Email {
    return this.email;
  }

  public getPasswordHash(): string {
    return this.passwordHash;
  }

  public getDisplayName(): string {
    return this.displayName;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  public lockedUntilAt(clock: Clock): Nullable<Date> {
    return this.lockedUntil !== null && this.lockedUntil.getTime() > clock.now().getTime()
      ? this.lockedUntil
      : null;
  }

  public recordFailedLogin(policy: LockoutPolicy, clock: Clock): void {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= policy.maxAttempts) {
      this.lockoutCount += 1;
      this.failedLoginAttempts = 0;
      const minutes: number = policy.lockDurationMinutes(this.lockoutCount);
      this.lockedUntil = new Date(clock.now().getTime() + minutes * 60_000);
    }
  }

  public recordSuccessfulLogin(clock: Clock): void {
    this.failedLoginAttempts = 0;
    this.lockoutCount = 0;
    this.lockedUntil = null;
    this.lastLoginAt = clock.now();
  }

  public changePassword(newHash: string): void {
    this.passwordHash = newHash;
  }

  public rename(displayName: string): Result<User> {
    return User.validateDisplayName(displayName).map((name: string): User => {
      this.displayName = name;
      return this;
    });
  }

  public toSnapshot(): UserSnapshot {
    return {
      id: this.id.toString(),
      email: this.email.toString(),
      passwordHash: this.passwordHash,
      displayName: this.displayName,
      status: this.status,
      failedLoginAttempts: this.failedLoginAttempts,
      lockoutCount: this.lockoutCount,
      lockedUntil: this.lockedUntil,
      createdAt: this.createdAt,
      lastLoginAt: this.lastLoginAt,
    };
  }
}
