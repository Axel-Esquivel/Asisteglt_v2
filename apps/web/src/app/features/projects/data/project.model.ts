import { ModuleType, ProjectPermission, ProjectRole } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { FieldDecoder, FieldReader } from '@asisteglt/web-core';
import { ProjectLabels } from './project-labels';

const MODULES: ReadonlyArray<ModuleType> = Object.values(ModuleType);
const ROLES: ReadonlyArray<ProjectRole> = Object.values(ProjectRole);
const PERMISSIONS: ReadonlyArray<ProjectPermission> = Object.values(ProjectPermission);

/** Proyecto visto por el usuario actual (incluye su rol y permisos). */
export class ProjectSummary {
  public constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly moduleType: ModuleType,
    public readonly memberCount: number,
    public readonly myRole: ProjectRole,
    private readonly permissions: ReadonlyArray<ProjectPermission>,
    public readonly createdAt: Date,
  ) {}

  public static decoder(): FieldDecoder<ProjectSummary> {
    return new FieldDecoder<ProjectSummary>(
      (f: FieldReader): ProjectSummary =>
        new ProjectSummary(
          f.string('id'),
          f.string('name'),
          f.string('description'),
          f.oneOf('moduleType', MODULES),
          f.number('memberCount'),
          f.oneOf('myRole', ROLES),
          f.oneOfList('myPermissions', PERMISSIONS),
          f.date('createdAt'),
        ),
    );
  }

  public can(permission: ProjectPermission): boolean {
    return this.permissions.includes(permission);
  }

  public isReports(): boolean {
    return this.moduleType === ModuleType.REPORTS;
  }

  public moduleLabel(): string {
    return ProjectLabels.module(this.moduleType);
  }

  public moduleIcon(): string {
    return ProjectLabels.moduleIcon(this.moduleType);
  }

  public roleLabel(): string {
    return ProjectLabels.role(this.myRole);
  }
}

export class ProjectMemberView {
  public constructor(
    public readonly userId: string,
    public readonly displayName: string,
    public readonly email: string,
    public readonly role: ProjectRole,
    public readonly joinedAt: Date,
  ) {}

  public static decoder(): FieldDecoder<ProjectMemberView> {
    return new FieldDecoder<ProjectMemberView>(
      (f: FieldReader): ProjectMemberView =>
        new ProjectMemberView(
          f.string('userId'),
          f.string('displayName'),
          f.string('email'),
          f.oneOf('role', ROLES),
          f.date('joinedAt'),
        ),
    );
  }

  public isOwner(): boolean {
    return this.role === ProjectRole.OWNER;
  }

  public roleLabel(): string {
    return ProjectLabels.role(this.role);
  }
}

export class ShareLinkView {
  public constructor(
    public readonly id: string,
    public readonly role: ProjectRole,
    public readonly expiresAt: Nullable<Date>,
    public readonly maxUses: Nullable<number>,
    public readonly uses: number,
    public readonly active: boolean,
    public readonly createdAt: Date,
  ) {}

  public static decoder(): FieldDecoder<ShareLinkView> {
    return new FieldDecoder<ShareLinkView>(
      (f: FieldReader): ShareLinkView =>
        new ShareLinkView(
          f.string('id'),
          f.oneOf('role', ROLES),
          f.nullableDate('expiresAt'),
          f.nullableNumber('maxUses'),
          f.number('uses'),
          f.boolean('active'),
          f.date('createdAt'),
        ),
    );
  }

  public roleLabel(): string {
    return ProjectLabels.role(this.role);
  }

  public usesLabel(): string {
    return this.maxUses === null
      ? `${String(this.uses)} usos`
      : `${String(this.uses)} de ${String(this.maxUses)}`;
  }
}

export class CreatedShareLink {
  public constructor(
    public readonly link: ShareLinkView,
    public readonly token: string,
  ) {}

  public static decoder(): FieldDecoder<CreatedShareLink> {
    return new FieldDecoder<CreatedShareLink>(
      (f: FieldReader): CreatedShareLink =>
        new CreatedShareLink(f.nested('link', ShareLinkView.decoder()), f.string('token')),
    );
  }
}
