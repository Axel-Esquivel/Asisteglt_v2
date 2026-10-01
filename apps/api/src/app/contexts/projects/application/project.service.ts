import { Injectable } from '@nestjs/common';
import { ModuleType, ProjectPermission, ProjectRole } from '@asisteglt/shared-contracts';
import { Clock, Email, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { OpaqueTokenService } from '../../iam/domain/ports';
import { UserDirectory } from '../../iam/application/user-directory';
import { User } from '../../iam/domain/user';
import { Project, ProjectMember } from '../domain/project';
import { ProjectErrors } from '../domain/project-errors';
import { ProjectRepository, ShareLinkRepository } from '../domain/ports';
import { ShareLink } from '../domain/share-link';
import { ProjectAccess } from './project-access';

export class MemberView {
  public constructor(
    public readonly member: ProjectMember,
    public readonly user: Nullable<User>,
  ) {}
}

export class CreatedShareLink {
  public constructor(
    public readonly link: ShareLink,
    public readonly token: string,
  ) {}
}

export class ShareLinkSpec {
  public constructor(
    public readonly role: ProjectRole,
    public readonly expiresInDays: Nullable<number>,
    public readonly maxUses: Nullable<number>,
  ) {}
}

/** Casos de uso de proyectos, miembros y vínculos para compartir. */
@Injectable()
export class ProjectService {
  public constructor(
    private readonly projects: ProjectRepository,
    private readonly links: ShareLinkRepository,
    private readonly access: ProjectAccess,
    private readonly directory: UserDirectory,
    private readonly tokens: OpaqueTokenService,
    private readonly clock: Clock,
  ) {}

  public async create(owner: EntityId, name: string, description: string, moduleType: ModuleType): Promise<Result<Project>> {
    const created: Result<Project> = Project.create(name, description, moduleType, owner, this.clock);
    if (created.isOk()) {
      await this.projects.save(created.unwrap());
    }
    return created;
  }

  public listFor(userId: EntityId): Promise<Project[]> {
    return this.projects.findByMember(userId);
  }

  public get(projectId: string, userId: EntityId): Promise<Result<Project>> {
    return this.access.load(projectId, userId);
  }

  public async update(projectId: string, userId: EntityId, name: string, description: string): Promise<Result<Project>> {
    return this.persist(
      (await this.access.require(projectId, userId, ProjectPermission.PROJECT_MANAGE)).flatMap(
        (p: Project): Result<Project> => p.update(name, description),
      ),
    );
  }

  public async members(projectId: string, userId: EntityId): Promise<Result<MemberView[]>> {
    const project: Result<Project> = await this.access.load(projectId, userId);
    if (!project.isOk()) {
      return Result.fail(ProjectErrors.notFound());
    }
    const members: ReadonlyArray<ProjectMember> = project.unwrap().getMembers();
    const users: User[] = await this.directory.findMany(members.map((m: ProjectMember): EntityId => m.userId));
    return Result.ok(
      members.map(
        (m: ProjectMember): MemberView =>
          new MemberView(m, users.find((u: User): boolean => u.getId().equals(m.userId)) ?? null),
      ),
    );
  }

  public async addMember(projectId: string, actor: EntityId, email: string, role: ProjectRole): Promise<Result<Project>> {
    const project: Result<Project> = await this.access.require(projectId, actor, ProjectPermission.MEMBERS_MANAGE);
    if (!project.isOk()) {
      return project;
    }
    const parsed: Result<Email> = Email.create(email);
    const user: Nullable<User> = parsed.isOk() ? (await this.directory.findByEmail(parsed.unwrap())).toNullable() : null;
    if (user === null) {
      return Result.fail(ProjectErrors.userNotFound());
    }
    return this.persist(project.flatMap((p: Project): Result<Project> => p.addMember(user.getId(), role, this.clock)));
  }

  public async changeRole(projectId: string, actor: EntityId, memberId: string, role: ProjectRole): Promise<Result<Project>> {
    const target: Result<EntityId> = EntityId.fromString(memberId);
    if (!target.isOk()) {
      return Result.fail(ProjectErrors.memberNotFound());
    }
    return this.persist(
      (await this.access.require(projectId, actor, ProjectPermission.MEMBERS_MANAGE)).flatMap(
        (p: Project): Result<Project> => p.changeRole(target.unwrap(), role),
      ),
    );
  }

  /** Quita a un miembro; cualquier miembro (salvo el propietario) puede salir por sí mismo. */
  public async removeMember(projectId: string, actor: EntityId, memberId: string): Promise<Result<Project>> {
    const target: Result<EntityId> = EntityId.fromString(memberId);
    if (!target.isOk()) {
      return Result.fail(ProjectErrors.memberNotFound());
    }
    const self: boolean = target.unwrap().equals(actor);
    const project: Result<Project> = self
      ? await this.access.load(projectId, actor)
      : await this.access.require(projectId, actor, ProjectPermission.MEMBERS_MANAGE);
    return this.persist(project.flatMap((p: Project): Result<Project> => p.removeMember(target.unwrap())));
  }

  public async createShareLink(projectId: string, actor: EntityId, spec: ShareLinkSpec): Promise<Result<CreatedShareLink>> {
    const project: Result<Project> = await this.access.require(projectId, actor, ProjectPermission.MEMBERS_MANAGE);
    if (!project.isOk()) {
      return Result.fail(ProjectErrors.denied(ProjectPermission.MEMBERS_MANAGE));
    }
    const module: ModuleType = project.unwrap().getModuleType();
    if (spec.role === ProjectRole.OWNER || !Project.roleAllowed(module, spec.role)) {
      return Result.fail(ProjectErrors.roleNotAllowed());
    }
    const token: string = this.tokens.generate();
    const link: ShareLink = ShareLink.create(
      project.unwrap().getId(),
      this.tokens.digest(token),
      spec.role,
      spec.expiresInDays,
      spec.maxUses,
      actor,
      this.clock,
    );
    await this.links.save(link);
    return Result.ok(new CreatedShareLink(link, token));
  }

  public async shareLinks(projectId: string, actor: EntityId): Promise<Result<ShareLink[]>> {
    const project: Result<Project> = await this.access.require(projectId, actor, ProjectPermission.MEMBERS_MANAGE);
    if (!project.isOk()) {
      return Result.fail(ProjectErrors.denied(ProjectPermission.MEMBERS_MANAGE));
    }
    return Result.ok(await this.links.findByProject(project.unwrap().getId()));
  }

  public async revokeShareLink(projectId: string, actor: EntityId, linkId: string): Promise<Result<ShareLink>> {
    const project: Result<Project> = await this.access.require(projectId, actor, ProjectPermission.MEMBERS_MANAGE);
    const id: Result<EntityId> = EntityId.fromString(linkId);
    if (!project.isOk() || !id.isOk()) {
      return Result.fail(ProjectErrors.shareLinkInvalid());
    }
    const link: Nullable<ShareLink> = (await this.links.findById(id.unwrap()))
      .filter((l: ShareLink): boolean => l.getProjectId().equals(project.unwrap().getId()))
      .toNullable();
    if (link === null) {
      return Result.fail(ProjectErrors.shareLinkInvalid());
    }
    link.revoke(this.clock);
    await this.links.save(link);
    return Result.ok(link);
  }

  /** Une al usuario al proyecto del vínculo; si ya es miembro, simplemente lo devuelve. */
  public async redeem(token: string, userId: EntityId): Promise<Result<Project>> {
    const link: Nullable<ShareLink> = (await this.links.findByTokenHash(this.tokens.digest(token)))
      .filter((l: ShareLink): boolean => l.isUsable(this.clock))
      .toNullable();
    if (link === null) {
      return Result.fail(ProjectErrors.shareLinkInvalid());
    }
    const project: Nullable<Project> = (await this.projects.findById(link.getProjectId())).toNullable();
    if (project === null) {
      return Result.fail(ProjectErrors.shareLinkInvalid());
    }
    if (project.roleOf(userId) !== null) {
      return Result.ok(project);
    }
    const joined: Result<Project> = project.addMember(userId, link.getRole(), this.clock);
    if (joined.isOk()) {
      link.registerUse();
      await this.links.save(link);
    }
    return this.persist(joined);
  }

  private async persist(result: Result<Project>): Promise<Result<Project>> {
    if (result.isOk()) {
      await this.projects.save(result.unwrap());
    }
    return result;
  }
}
