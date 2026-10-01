import { ModuleType, ProjectRole } from '@asisteglt/shared-contracts';

export interface RoleOption {
  readonly label: string;
  readonly value: ProjectRole;
}

export interface ModuleOption {
  readonly label: string;
  readonly value: ModuleType;
}

/** Textos de interfaz para módulos y roles de proyecto. */
export class ProjectLabels {
  private static readonly MODULES: ReadonlyMap<ModuleType, string> = new Map([
    [ModuleType.REPORTS, 'Reportes'],
    [ModuleType.INVENTORY, 'Inventarios'],
  ]);

  private static readonly ROLES: ReadonlyMap<ProjectRole, string> = new Map([
    [ProjectRole.OWNER, 'Propietario'],
    [ProjectRole.ADMIN, 'Administrador'],
    [ProjectRole.ANALYST, 'Analista'],
    [ProjectRole.DESIGNER, 'Diseñador'],
    [ProjectRole.VIEWER, 'Lector'],
    [ProjectRole.SUPERVISOR, 'Supervisor'],
    [ProjectRole.COUNTER, 'Contador'],
    [ProjectRole.AUDITOR, 'Auditor'],
  ]);

  private static readonly ASSIGNABLE: ReadonlyMap<ModuleType, ReadonlyArray<ProjectRole>> = new Map([
    [ModuleType.REPORTS, [ProjectRole.ADMIN, ProjectRole.ANALYST, ProjectRole.DESIGNER, ProjectRole.VIEWER]],
    [
      ModuleType.INVENTORY,
      [ProjectRole.ADMIN, ProjectRole.SUPERVISOR, ProjectRole.COUNTER, ProjectRole.AUDITOR],
    ],
  ]);

  public static module(module: ModuleType): string {
    return ProjectLabels.MODULES.get(module) ?? module;
  }

  public static moduleIcon(module: ModuleType): string {
    return module === ModuleType.REPORTS ? 'pi pi-chart-bar' : 'pi pi-box';
  }

  public static role(role: ProjectRole): string {
    return ProjectLabels.ROLES.get(role) ?? role;
  }

  public static assignableRoles(module: ModuleType): RoleOption[] {
    return (ProjectLabels.ASSIGNABLE.get(module) ?? []).map((value: ProjectRole): RoleOption => ({
      value,
      label: ProjectLabels.role(value),
    }));
  }

  /** Rol propuesto al invitar: lector en Reportes, contador en Inventarios. */
  public static defaultInviteRole(module: ModuleType): ProjectRole {
    return module === ModuleType.REPORTS ? ProjectRole.VIEWER : ProjectRole.COUNTER;
  }

  public static moduleOptions(): ModuleOption[] {
    return [
      { label: 'Reportes', value: ModuleType.REPORTS },
      { label: 'Inventarios', value: ModuleType.INVENTORY },
    ];
  }
}
