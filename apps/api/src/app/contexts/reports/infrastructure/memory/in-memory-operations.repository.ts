import { Injectable } from '@nestjs/common';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { OperationPipeline, OperationPipelineSnapshot } from '../../domain/operation-pipeline';
import { OperationPipelineRepository } from '../../domain/ports';

@Injectable()
export class InMemoryOperationPipelineRepository extends OperationPipelineRepository {
  private readonly collection: InMemoryCollection<OperationPipelineSnapshot> =
    new InMemoryCollection<OperationPipelineSnapshot>();

  public override findByProject(projectId: EntityId): Promise<Optional<OperationPipeline>> {
    const found: Nullable<OperationPipelineSnapshot> = this.collection.find(
      (s: OperationPipelineSnapshot): boolean => s.projectId === projectId.toString(),
    );
    return Promise.resolve(Optional.fromNullable(found).map(OperationPipeline.restore));
  }

  public override save(pipeline: OperationPipeline): Promise<void> {
    this.collection.put(pipeline.toSnapshot());
    return Promise.resolve();
  }
}
