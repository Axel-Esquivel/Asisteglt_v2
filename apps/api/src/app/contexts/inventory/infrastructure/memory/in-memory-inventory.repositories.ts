import { Injectable } from '@nestjs/common';
import { EntityId, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { InventoryCount, InventoryCountSnapshot } from '../../domain/inventory-count';
import { CountEntrySnapshot, InventoryItemSnapshot } from '../../domain/inventory-records';
import { CountEntryRepository, InventoryCountRepository, InventoryItemRepository } from '../../domain/ports';

@Injectable()
export class InMemoryInventoryCountRepository extends InventoryCountRepository {
  private readonly collection: InMemoryCollection<InventoryCountSnapshot> =
    new InMemoryCollection<InventoryCountSnapshot>();

  public override findById(id: EntityId): Promise<Optional<InventoryCount>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.get(id.toString())).map(InventoryCount.restore),
    );
  }

  public override findByProject(projectId: EntityId): Promise<InventoryCount[]> {
    return Promise.resolve(
      this.collection
        .filter((c: InventoryCountSnapshot): boolean => c.projectId === projectId.toString())
        .sort(
          (a: InventoryCountSnapshot, b: InventoryCountSnapshot): number =>
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map(InventoryCount.restore),
    );
  }

  public override save(count: InventoryCount): Promise<void> {
    this.collection.put(count.toSnapshot());
    return Promise.resolve();
  }
}

@Injectable()
export class InMemoryInventoryItemRepository extends InventoryItemRepository {
  private readonly collection: InMemoryCollection<InventoryItemSnapshot> =
    new InMemoryCollection<InventoryItemSnapshot>();

  public override replaceForCount(
    countId: string,
    items: ReadonlyArray<InventoryItemSnapshot>,
  ): Promise<void> {
    this.collection
      .filter((i: InventoryItemSnapshot): boolean => i.countId === countId)
      .forEach((i: InventoryItemSnapshot): void => this.collection.delete(i.id));
    items.forEach((i: InventoryItemSnapshot): void => this.collection.put(i));
    return Promise.resolve();
  }

  public override findByCount(countId: string): Promise<InventoryItemSnapshot[]> {
    return Promise.resolve(
      this.collection.filter((i: InventoryItemSnapshot): boolean => i.countId === countId),
    );
  }
}

@Injectable()
export class InMemoryCountEntryRepository extends CountEntryRepository {
  private readonly collection: InMemoryCollection<CountEntrySnapshot> =
    new InMemoryCollection<CountEntrySnapshot>();

  public override add(entry: CountEntrySnapshot): Promise<void> {
    this.collection.put(entry);
    return Promise.resolve();
  }

  public override findByCount(countId: string): Promise<CountEntrySnapshot[]> {
    return Promise.resolve(this.collection.filter((e: CountEntrySnapshot): boolean => e.countId === countId));
  }
}
