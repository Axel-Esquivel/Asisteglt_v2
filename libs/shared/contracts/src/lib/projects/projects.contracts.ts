/** Contratos de proyectos, miembros y vínculos para compartir. */
export enum ModuleType {
  REPORTS = 'REPORTS',
  INVENTORY = 'INVENTORY',
}

export enum ProjectRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  ANALYST = 'ANALYST',
  DESIGNER = 'DESIGNER',
  VIEWER = 'VIEWER',
  SUPERVISOR = 'SUPERVISOR',
  COUNTER = 'COUNTER',
  AUDITOR = 'AUDITOR',
}

export enum ProjectPermission {
  PROJECT_MANAGE = 'PROJECT_MANAGE',
  MEMBERS_MANAGE = 'MEMBERS_MANAGE',
  DATA_CONFIGURE = 'DATA_CONFIGURE',
  DATA_LOAD = 'DATA_LOAD',
  DATA_VIEW = 'DATA_VIEW',
  REPORTS_DESIGN = 'REPORTS_DESIGN',
  REPORTS_VIEW = 'REPORTS_VIEW',
  INVENTORY_CONFIGURE = 'INVENTORY_CONFIGURE',
  INVENTORY_SUPERVISE = 'INVENTORY_SUPERVISE',
  INVENTORY_COUNT = 'INVENTORY_COUNT',
  INVENTORY_VIEW = 'INVENTORY_VIEW',
}

export interface CreateProjectRequest {
  readonly name: string;
  readonly description: string;
  readonly moduleType: ModuleType;
}

export interface UpdateProjectRequest {
  readonly name: string;
  readonly description: string;
}

export interface ProjectResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly moduleType: ModuleType;
  readonly ownerId: string;
  readonly memberCount: number;
  readonly myRole: ProjectRole;
  readonly myPermissions: ReadonlyArray<ProjectPermission>;
  readonly createdAt: string;
}

export interface MemberResponse {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: ProjectRole;
  readonly joinedAt: string;
}

export interface AddMemberRequest {
  readonly email: string;
  readonly role: ProjectRole;
}

export interface ChangeMemberRoleRequest {
  readonly role: ProjectRole;
}

export interface CreateShareLinkRequest {
  readonly role: ProjectRole;
  readonly expiresInDays: number | null;
  readonly maxUses: number | null;
}

export interface ShareLinkResponse {
  readonly id: string;
  readonly role: ProjectRole;
  readonly expiresAt: string | null;
  readonly maxUses: number | null;
  readonly uses: number;
  readonly active: boolean;
  readonly createdAt: string;
}

/** El token solo se devuelve al crearlo; después no puede recuperarse. */
export interface CreatedShareLinkResponse {
  readonly link: ShareLinkResponse;
  readonly token: string;
}

export interface RedeemShareLinkRequest {
  readonly token: string;
}

export enum ProjectErrorCode {
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  INVALID_PROJECT_NAME = 'INVALID_PROJECT_NAME',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROLE_NOT_ALLOWED = 'ROLE_NOT_ALLOWED',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  ALREADY_MEMBER = 'ALREADY_MEMBER',
  OWNER_IMMUTABLE = 'OWNER_IMMUTABLE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  SHARE_LINK_INVALID = 'SHARE_LINK_INVALID',
}
