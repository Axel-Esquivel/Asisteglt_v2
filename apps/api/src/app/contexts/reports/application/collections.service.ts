import { Injectable } from '@nestjs/common';
import { CollectionErrorCode, CollectionRequest } from '@asisteglt/shared-contracts';
import { Clock, ConflictError, EntityId, NotFoundError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import { OperationPipeline } from '../domain/operation-pipeline';
import { CollectionRepository, OperationPipelineRepository } from '../domain/ports';
import { SupplementaryCollection } from '../domain/supplementary-collection';
import { ReportsAccess } from './reports-access';

/** Colecciones complementarias del proyecto (tipos de cambio, sueldos…). */
@Injectable()
export class CollectionsService {
  public constructor(
    private readonly collections: CollectionRepository,
    private readonly pipelines: OperationPipelineRepository,
    private readonly access: ReportsAccess,
    private readonly clock: Clock,
  ) {}

  public async list(projectId: string, userId: EntityId): Promise<Result<SupplementaryCollection[]>> {
    return (await this.access.read(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<SupplementaryCollection[]>> =>
        Result.ok(await this.collections.findByProject(p.getId())),
    );
  }

  public async save(
    projectId: string,
    userId: EntityId,
    collectionId: Nullable<string>,
    request: CollectionRequest,
  ): Promise<Result<SupplementaryCollection>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<SupplementaryCollection>> => {
        const result: Result<SupplementaryCollection> =
          collectionId === null
            ? SupplementaryCollection.create(p.getId(), request, this.clock)
            : (await this.find(p, collectionId)).flatMap(
                (c: SupplementaryCollection): Result<SupplementaryCollection> =>
                  c.update(request, this.clock),
              );
        if (result.isOk()) {
          await this.collections.save(result.unwrap());
        }
        return result;
      },
    );
  }

  public async delete(projectId: string, userId: EntityId, collectionId: string): Promise<Result<true>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<true>> =>
        (await this.find(p, collectionId)).flatMapAsync(
          async (c: SupplementaryCollection): Promise<Result<true>> => {
            const used: boolean = (await this.pipelines.findByProject(p.getId()))
              .map((pipeline: OperationPipeline): boolean => pipeline.usesCollection(c.getId().toString()))
              .orElse(false);
            if (used) {
              return Result.fail(
                new ConflictError(
                  CollectionErrorCode.COLLECTION_IN_USE,
                  'La colección se usa en una conversión de moneda',
                ),
              );
            }
            await this.collections.delete(c.getId());
            return Result.ok(true);
          },
        ),
    );
  }

  private async find(project: Project, id: string): Promise<Result<SupplementaryCollection>> {
    const parsed: Result<EntityId> = EntityId.fromString(id);
    const found: Nullable<SupplementaryCollection> = parsed.isOk()
      ? (await this.collections.findById(parsed.unwrap()))
          .filter((c: SupplementaryCollection): boolean => c.belongsTo(project.getId()))
          .toNullable()
      : null;
    return found === null
      ? Result.fail(new NotFoundError(CollectionErrorCode.COLLECTION_NOT_FOUND, 'La colección no existe'))
      : Result.ok(found);
  }
}
