import { ModuleType, ProjectPermission, ProjectRole } from '@asisteglt/shared-contracts';

/**
 * Roles predefinidos por módulo y sus permisos (docs/09 §3). El propietario tiene todos.
 */
export class RoleCatalog {
  private static readonly REPORT_ROLES: ReadonlyMap<ProjectRole, ReadonlyArray<ProjectPermission>> = new Map([
    [ProjectRole.OWNER, Object.values(ProjectPermission)],
    [
      ProjectRole.ADMIN,
      [
        ProjectPermission.PROJECT_MANAGE,
        ProjectPermission.MEMBERS_MANAGE,
        ProjectPermission.DATA_CONFIGURE,
        ProjectPermission.DATA_LOAD,
        ProjectPermission.DATA_VIEW,
        ProjectPermission.REPORTS_DESIGN,
        ProjectPermission.REPORTS_VIEW,
      ],
    ],
    [
      ProjectRole.ANALYST,
      [
        ProjectPermission.DATA_CONFIGURE,
        ProjectPermission.DATA_LOAD,
        ProjectPermission.DATA_VIEW,
        ProjectPermission.REPORTS_VIEW,
      ],
    ],
    [
      ProjectRole.DESIGNER,
      [ProjectPermission.DATA_VIEW, ProjectPermission.REPORTS_DESIGN, ProjectPermission.REPORTS_VIEW],
    ],
    [ProjectRole.VIEWER, [ProjectPermission.REPORTS_VIEW]],
  ]);

  private static readonly INVENTORY_ROLES: ReadonlyMap<ProjectRole, ReadonlyArray<ProjectPermission>> =
    new Map([
      [ProjectRole.OWNER, Object.values(ProjectPermission)],
      [
        ProjectRole.ADMIN,
        [
          ProjectPermission.PROJECT_MANAGE,
          ProjectPermission.MEMBERS_MANAGE,
          ProjectPermission.DATA_CONFIGURE,
          ProjectPermission.DATA_LOAD,
          ProjectPermission.INVENTORY_CONFIGURE,
          ProjectPermission.INVENTORY_SUPERVISE,
          ProjectPermission.INVENTORY_VIEW,
        ],
      ],
      [ProjectRole.SUPERVISOR, [ProjectPermission.INVENTORY_SUPERVISE, ProjectPermission.INVENTORY_VIEW]],
      [ProjectRole.COUNTER, [ProjectPermission.INVENTORY_COUNT]],
      [ProjectRole.AUDITOR, [ProjectPermission.INVENTORY_VIEW]],
    ]);

  public static rolesFor(module: ModuleType): ProjectRole[] {
    return [...RoleCatalog.table(module).keys()];
  }

  public static isAllowed(module: ModuleType, role: ProjectRole): boolean {
    return RoleCatalog.table(module).has(role);
  }

  public static permissions(module: ModuleType, role: ProjectRole): ReadonlyArray<ProjectPermission> {
    return RoleCatalog.table(module).get(role) ?? [];
  }

  public static grants(module: ModuleType, role: ProjectRole, permission: ProjectPermission): boolean {
    return RoleCatalog.permissions(module, role).includes(permission);
  }

  private static table(module: ModuleType): ReadonlyMap<ProjectRole, ReadonlyArray<ProjectPermission>> {
    switch (module) {
      case ModuleType.REPORTS:
        return RoleCatalog.REPORT_ROLES;
      case ModuleType.INVENTORY:
        return RoleCatalog.INVENTORY_ROLES;
    }
  }
}
