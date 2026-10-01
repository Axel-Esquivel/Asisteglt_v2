import { Injectable } from '@nestjs/common';
import { EntityId, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { CollectionRepository } from '../../domain/ports';
import { CollectionSnapshot, SupplementaryCollection } from '../../domain/supplementary-collection';

@Injectable()
export class InMemoryCollectionRepository extends CollectionRepository {
  private readonly collection: InMemoryCollection<CollectionSnapshot> =
    new InMemoryCollection<CollectionSnapshot>();

  public override findById(id: EntityId): Promise<Optional<SupplementaryCollection>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.get(id.toString())).map(SupplementaryCollection.restore),
    );
  }

  public override findByProject(projectId: EntityId): Promise<SupplementaryCollection[]> {
    return Promise.resolve(
      this.collection
        .filter((c: CollectionSnapshot): boolean => c.projectId === projectId.toString())
        .map(SupplementaryCollection.restore),
    );
  }

  public override save(collection: SupplementaryCollection): Promise<void> {
    this.collection.put(collection.toSnapshot());
    return Promise.resolve();
  }

  public override delete(id: EntityId): Promise<void> {
    this.collection.delete(id.toString());
    return Promise.resolve();
  }
}
