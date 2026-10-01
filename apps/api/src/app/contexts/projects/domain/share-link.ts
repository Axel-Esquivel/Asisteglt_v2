import { ProjectRole } from '@asisteglt/shared-contracts';
import { AggregateRoot, Clock, EntityId, Nullable } from '@asisteglt/shared-kernel';

export interface ShareLinkSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly tokenHash: string;
  readonly role: ProjectRole;
  readonly expiresAt: Nullable<Date>;
  readonly maxUses: Nullable<number>;
  readonly uses: number;
  readonly revokedAt: Nullable<Date>;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** Vínculo para unirse a un proyecto con un rol; solo se guarda la huella del token. */
export class ShareLink extends AggregateRoot {
  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private readonly tokenHash: string,
    private readonly role: ProjectRole,
    private readonly expiresAt: Nullable<Date>,
    private readonly maxUses: Nullable<number>,
    private uses: number,
    private revokedAt: Nullable<Date>,
    private readonly createdBy: EntityId,
    private readonly createdAt: Date,
  ) {
    super(id);
  }

  public static create(
    projectId: EntityId,
    tokenHash: string,
    role: ProjectRole,
    expiresInDays: Nullable<number>,
    maxUses: Nullable<number>,
    createdBy: EntityId,
    clock: Clock,
  ): ShareLink {
    const now: Date = clock.now();
    const expiresAt: Nullable<Date> = expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * 86_400_000);
    return new ShareLink(EntityId.generate(), projectId, tokenHash, role, expiresAt, maxUses, 0, null, createdBy, now);
  }

  public static restore(s: ShareLinkSnapshot): ShareLink {
    return new ShareLink(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.projectId).unwrap(),
      s.tokenHash,
      s.role,
      s.expiresAt,
      s.maxUses,
      s.uses,
      s.revokedAt,
      EntityId.fromString(s.createdBy).unwrap(),
      s.createdAt,
    );
  }

  public getProjectId(): EntityId {
    return this.projectId;
  }

  public getRole(): ProjectRole {
    return this.role;
  }

  public isUsable(clock: Clock): boolean {
    const notExpired: boolean = this.expiresAt === null || this.expiresAt.getTime() > clock.now().getTime();
    const withUses: boolean = this.maxUses === null || this.uses < this.maxUses;
    return this.revokedAt === null && notExpired && withUses;
  }

  public registerUse(): void {
    this.uses += 1;
  }

  public revoke(clock: Clock): void {
    if (this.revokedAt === null) {
      this.revokedAt = clock.now();
    }
  }

  public toSnapshot(): ShareLinkSnapshot {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      tokenHash: this.tokenHash,
      role: this.role,
      expiresAt: this.expiresAt,
      maxUses: this.maxUses,
      uses: this.uses,
      revokedAt: this.revokedAt,
      createdBy: this.createdBy.toString(),
      createdAt: this.createdAt,
    };
  }
}
