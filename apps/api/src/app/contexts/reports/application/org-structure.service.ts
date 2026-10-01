import { Injectable } from '@nestjs/common';
import { CreateOrgUnitRequest, UpdateOrgUnitRequest } from '@asisteglt/shared-contracts';
import { EntityId, Result } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import { OrgStructure, OrgUnitSnapshot } from '../domain/org-structure';
import { OrgStructureRepository } from '../domain/ports';
import { ReportsAccess } from './reports-access';

@Injectable()
export class OrgStructureService {
  public constructor(
    private readonly structures: OrgStructureRepository,
    private readonly access: ReportsAccess,
  ) {}

  public async get(projectId: string, userId: EntityId): Promise<Result<OrgStructure>> {
    return (await this.access.read(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<OrgStructure>> => Result.ok(await this.of(project.getId())),
    );
  }

  public add(
    projectId: string,
    userId: EntityId,
    request: CreateOrgUnitRequest,
  ): Promise<Result<OrgUnitSnapshot>> {
    return this.mutate(projectId, userId, (s: OrgStructure): Result<OrgUnitSnapshot> =>
      s.add(request.level, request.parentId, request.code, request.name, request.currencies),
    );
  }

  public change(
    projectId: string,
    userId: EntityId,
    unitId: string,
    request: UpdateOrgUnitRequest,
  ): Promise<Result<OrgUnitSnapshot>> {
    return this.mutate(projectId, userId, (s: OrgStructure): Result<OrgUnitSnapshot> =>
      s.change(unitId, request.code, request.name, request.currencies),
    );
  }

  public remove(projectId: string, userId: EntityId, unitId: string): Promise<Result<OrgStructure>> {
    return this.mutate(projectId, userId, (s: OrgStructure): Result<OrgStructure> => s.remove(unitId));
  }

  public async of(projectId: EntityId): Promise<OrgStructure> {
    return (await this.structures.findByProject(projectId)).orElseGet((): OrgStructure =>
      OrgStructure.empty(projectId),
    );
  }

  private async mutate<T>(
    projectId: string,
    userId: EntityId,
    change: (s: OrgStructure) => Result<T>,
  ): Promise<Result<T>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<T>> => {
        const structure: OrgStructure = await this.of(project.getId());
        const result: Result<T> = change(structure);
        if (result.isOk()) {
          await this.structures.save(structure);
        }
        return result;
      },
    );
  }
}
