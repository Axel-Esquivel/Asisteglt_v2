import { EntityId, Optional } from '@asisteglt/shared-kernel';
import { InventoryCount } from './inventory-count';
import { CountEntrySnapshot, EvidenceSnapshot, InventoryItemSnapshot } from './inventory-records';

export abstract class InventoryCountRepository {
  public abstract findById(id: EntityId): Promise<Optional<InventoryCount>>;
  public abstract findByProject(projectId: EntityId): Promise<InventoryCount[]>;
  public abstract save(count: InventoryCount): Promise<void>;
}

export abstract class InventoryItemRepository {
  public abstract replaceForCount(
    countId: string,
    items: ReadonlyArray<InventoryItemSnapshot>,
  ): Promise<void>;
  public abstract findByCount(countId: string): Promise<InventoryItemSnapshot[]>;
}

export abstract class CountEntryRepository {
  public abstract add(entry: CountEntrySnapshot): Promise<void>;
  public abstract findByCount(countId: string): Promise<CountEntrySnapshot[]>;
}

export abstract class EvidenceRepository {
  public abstract add(evidence: EvidenceSnapshot): Promise<void>;
  public abstract findByCount(countId: string): Promise<EvidenceSnapshot[]>;
  public abstract findById(id: string): Promise<Optional<EvidenceSnapshot>>;
}
