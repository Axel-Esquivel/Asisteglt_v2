import { Injectable } from '@nestjs/common';
import { ProjectPermission } from '@asisteglt/shared-contracts';
import { EntityId, Result } from '@asisteglt/shared-kernel';
import { ProjectAccess } from '../../projects/application/project-access';
import { Project } from '../../projects/domain/project';

/** Autorización de los recursos de Reportes sobre `ProjectAccess`. */
@Injectable()
export class ReportsAccess {
  public constructor(private readonly access: ProjectAccess) {}

  /** Cualquier miembro puede leer la configuración (para ver nombres de encabezados, etc.). */
  public read(projectId: string, userId: EntityId): Promise<Result<Project>> {
    return this.access.load(projectId, userId);
  }

  public configure(projectId: string, userId: EntityId): Promise<Result<Project>> {
    return this.access.require(projectId, userId, ProjectPermission.DATA_CONFIGURE);
  }

  public load(projectId: string, userId: EntityId): Promise<Result<Project>> {
    return this.access.require(projectId, userId, ProjectPermission.DATA_LOAD);
  }

  public view(projectId: string, userId: EntityId): Promise<Result<Project>> {
    return this.access.require(projectId, userId, ProjectPermission.DATA_VIEW);
  }
}
