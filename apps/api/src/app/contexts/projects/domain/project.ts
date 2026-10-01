import { ModuleType, ProjectPermission, ProjectRole } from '@asisteglt/shared-contracts';
import { AggregateRoot, Clock, Collections, EntityId, Nullable, Optional, Result } from '@asisteglt/shared-kernel';
import { ProjectErrors } from './project-errors';
import { RoleCatalog } from './role-catalog';

export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface MemberSnapshot {
  readonly userId: string;
  readonly role: ProjectRole;
  readonly joinedAt: Date;
}

export interface ProjectSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly moduleType: ModuleType;
  readonly ownerId: string;
  readonly status: ProjectStatus;
  readonly members: ReadonlyArray<MemberSnapshot>;
  readonly createdAt: Date;
}

/** Miembro de un proyecto con su rol. */
export class ProjectMember {
  public constructor(
    public readonly userId: EntityId,
    public readonly role: ProjectRole,
    public readonly joinedAt: Date,
  ) {}

  public withRole(role: ProjectRole): ProjectMember {
    return new ProjectMember(this.userId, role, this.joinedAt);
  }
}

/** Proyecto de Reportes o Inventarios con sus miembros y roles. */
export class Project extends AggregateRoot {
  private constructor(
    id: EntityId,
    private name: string,
    private description: string,
    private readonly moduleType: ModuleType,
    private readonly ownerId: EntityId,
    private status: ProjectStatus,
    private members: ProjectMember[],
    private readonly createdAt: Date,
  ) {
    super(id);
  }

  public static create(
    name: string,
    description: string,
    moduleType: ModuleType,
    owner: EntityId,
    clock: Clock,
  ): Result<Project> {
    return Project.validateName(name).map((valid: string): Project => {
      const now: Date = clock.now();
      return new Project(EntityId.generate(), valid, description.trim(), moduleType, owner, ProjectStatus.ACTIVE, [
        new ProjectMember(owner, ProjectRole.OWNER, now),
      ], now);
    });
  }

  public static restore(s: ProjectSnapshot): Project {
    return new Project(
      EntityId.fromString(s.id).unwrap(),
      s.name,
      s.description,
      s.moduleType,
      EntityId.fromString(s.ownerId).unwrap(),
      s.status,
      s.members.map(
        (m: MemberSnapshot): ProjectMember => new ProjectMember(EntityId.fromString(m.userId).unwrap(), m.role, m.joinedAt),
      ),
      s.createdAt,
    );
  }

  public static roleAllowed(module: ModuleType, role: ProjectRole): boolean {
    return role !== ProjectRole.OWNER && RoleCatalog.isAllowed(module, role);
  }

  private static validateName(raw: string): Result<string> {
    const name: string = raw.trim().replace(/\s+/g, ' ');
    return name.length >= 3 && name.length <= 120 ? Result.ok(name) : Result.fail(ProjectErrors.invalidName());
  }

  public getModuleType(): ModuleType {
    return this.moduleType;
  }

  public getName(): string {
    return this.name;
  }

  public getDescription(): string {
    return this.description;
  }

  public getOwnerId(): EntityId {
    return this.ownerId;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public permissionsOf(userId: EntityId): ReadonlyArray<ProjectPermission> {
    const role: Nullable<ProjectRole> = this.roleOf(userId);
    return role === null ? [] : RoleCatalog.permissions(this.moduleType, role);
  }

  public getMembers(): ReadonlyArray<ProjectMember> {
    return this.members;
  }

  public member(userId: EntityId): Optional<ProjectMember> {
    return Collections.findFirst(this.members, (m: ProjectMember): boolean => m.userId.equals(userId));
  }

  public roleOf(userId: EntityId): Nullable<ProjectRole> {
    return this.member(userId)
      .map((m: ProjectMember): ProjectRole => m.role)
      .toNullable();
  }

  public can(userId: EntityId, permission: ProjectPermission): boolean {
    const role: Nullable<ProjectRole> = this.roleOf(userId);
    return role !== null && this.status === ProjectStatus.ACTIVE && RoleCatalog.grants(this.moduleType, role, permission);
  }

  public update(name: string, description: string): Result<Project> {
    return Project.validateName(name).map((valid: string): Project => {
      this.name = valid;
      this.description = description.trim();
      return this;
    });
  }

  public addMember(userId: EntityId, role: ProjectRole, clock: Clock): Result<Project> {
    if (!Project.roleAllowed(this.moduleType, role)) {
      return Result.fail(ProjectErrors.roleNotAllowed());
    }
    if (this.member(userId).isPresent()) {
      return Result.fail(ProjectErrors.alreadyMember());
    }
    this.members = [...this.members, new ProjectMember(userId, role, clock.now())];
    return Result.ok(this);
  }

  public changeRole(userId: EntityId, role: ProjectRole): Result<Project> {
    if (!Project.roleAllowed(this.moduleType, role)) {
      return Result.fail(ProjectErrors.roleNotAllowed());
    }
    if (userId.equals(this.ownerId)) {
      return Result.fail(ProjectErrors.ownerImmutable());
    }
    if (!this.member(userId).isPresent()) {
      return Result.fail(ProjectErrors.memberNotFound());
    }
    this.members = this.members.map((m: ProjectMember): ProjectMember => (m.userId.equals(userId) ? m.withRole(role) : m));
    return Result.ok(this);
  }

  public removeMember(userId: EntityId): Result<Project> {
    if (userId.equals(this.ownerId)) {
      return Result.fail(ProjectErrors.ownerImmutable());
    }
    if (!this.member(userId).isPresent()) {
      return Result.fail(ProjectErrors.memberNotFound());
    }
    this.members = this.members.filter((m: ProjectMember): boolean => !m.userId.equals(userId));
    return Result.ok(this);
  }

  public archive(): void {
    this.status = ProjectStatus.ARCHIVED;
  }

  public toSnapshot(): ProjectSnapshot {
    return {
      id: this.id.toString(),
      name: this.name,
      description: this.description,
      moduleType: this.moduleType,
      ownerId: this.ownerId.toString(),
      status: this.status,
      members: this.members.map(
        (m: ProjectMember): MemberSnapshot => ({ userId: m.userId.toString(), role: m.role, joinedAt: m.joinedAt }),
      ),
      createdAt: this.createdAt,
    };
  }
}
