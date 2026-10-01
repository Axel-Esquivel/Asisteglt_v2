import { AggregateRoot, Clock, EntityId, Nullable } from '@asisteglt/shared-kernel';

export interface SessionSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly previousTokenHashes: ReadonlyArray<string>;
  readonly userAgent: string;
  readonly ipAddress: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Nullable<Date>;
}

/** Información del dispositivo que abre la sesión. */
export class DeviceInfo {
  public constructor(
    public readonly userAgent: string,
    public readonly ipAddress: string,
  ) {}
}

/**
 * Sesión de un usuario en un dispositivo. El refresh token rota en cada uso; si se presenta un
 * token ya usado, la sesión se revoca (posible robo).
 */
export class Session extends AggregateRoot {
  private static readonly MAX_HISTORY: number = 50;

  private constructor(
    id: EntityId,
    private readonly userId: EntityId,
    private refreshTokenHash: string,
    private previousTokenHashes: string[],
    private readonly device: DeviceInfo,
    private readonly createdAt: Date,
    private lastSeenAt: Date,
    private expiresAt: Date,
    private revokedAt: Nullable<Date>,
  ) {
    super(id);
  }

  public static open(userId: EntityId, refreshTokenHash: string, device: DeviceInfo, ttlMs: number, clock: Clock): Session {
    const now: Date = clock.now();
    return new Session(EntityId.generate(), userId, refreshTokenHash, [], device, now, now, new Date(now.getTime() + ttlMs), null);
  }

  public static restore(s: SessionSnapshot): Session {
    return new Session(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.userId).unwrap(),
      s.refreshTokenHash,
      [...s.previousTokenHashes],
      new DeviceInfo(s.userAgent, s.ipAddress),
      s.createdAt,
      s.lastSeenAt,
      s.expiresAt,
      s.revokedAt,
    );
  }

  public getUserId(): EntityId {
    return this.userId;
  }

  public isActive(clock: Clock): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() > clock.now().getTime();
  }

  public isCurrentToken(hash: string): boolean {
    return this.refreshTokenHash === hash;
  }

  public wasTokenAlreadyUsed(hash: string): boolean {
    return this.previousTokenHashes.includes(hash);
  }

  public rotate(newHash: string, ttlMs: number, clock: Clock): void {
    this.previousTokenHashes = [this.refreshTokenHash, ...this.previousTokenHashes].slice(0, Session.MAX_HISTORY);
    this.refreshTokenHash = newHash;
    this.lastSeenAt = clock.now();
    this.expiresAt = new Date(this.lastSeenAt.getTime() + ttlMs);
  }

  public revoke(clock: Clock): void {
    if (this.revokedAt === null) {
      this.revokedAt = clock.now();
    }
  }

  public toSnapshot(): SessionSnapshot {
    return {
      id: this.id.toString(),
      userId: this.userId.toString(),
      refreshTokenHash: this.refreshTokenHash,
      previousTokenHashes: this.previousTokenHashes,
      userAgent: this.device.userAgent,
      ipAddress: this.device.ipAddress,
      createdAt: this.createdAt,
      lastSeenAt: this.lastSeenAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
    };
  }
}
