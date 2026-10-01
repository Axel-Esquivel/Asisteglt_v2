import { Injectable } from '@nestjs/common';
import { ProjectPermission } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { Project } from '../domain/project';
import { ProjectErrors } from '../domain/project-errors';
import { ProjectRepository } from '../domain/ports';

/**
 * Punto único de autorización para recursos de un proyecto (lo usan otros contextos).
 * Quien no es miembro recibe "no encontrado" para no revelar que el proyecto existe.
 */
@Injectable()
export class ProjectAccess {
  public constructor(private readonly projects: ProjectRepository) {}

  public async load(projectId: string, userId: EntityId): Promise<Result<Project>> {
    const id: Result<EntityId> = EntityId.fromString(projectId);
    if (!id.isOk()) {
      return Result.fail(ProjectErrors.notFound());
    }
    const project: Nullable<Project> = (await this.projects.findById(id.unwrap()))
      .filter((p: Project): boolean => p.roleOf(userId) !== null)
      .toNullable();
    return project === null ? Result.fail(ProjectErrors.notFound()) : Result.ok(project);
  }

  public async require(projectId: string, userId: EntityId, permission: ProjectPermission): Promise<Result<Project>> {
    return (await this.load(projectId, userId)).flatMap(
      (project: Project): Result<Project> =>
        project.can(userId, permission) ? Result.ok(project) : Result.fail(ProjectErrors.denied(permission)),
    );
  }
}
