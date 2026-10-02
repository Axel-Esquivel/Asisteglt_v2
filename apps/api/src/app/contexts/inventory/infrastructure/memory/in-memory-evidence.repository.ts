import { Injectable } from '@nestjs/common';
import { Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { EvidenceSnapshot } from '../../domain/inventory-records';
import { EvidenceRepository } from '../../domain/ports';

@Injectable()
export class InMemoryEvidenceRepository extends EvidenceRepository {
  private readonly collection: InMemoryCollection<EvidenceSnapshot> =
    new InMemoryCollection<EvidenceSnapshot>();

  public override add(evidence: EvidenceSnapshot): Promise<void> {
    this.collection.put(evidence);
    return Promise.resolve();
  }

  public override findByCount(countId: string): Promise<EvidenceSnapshot[]> {
    return Promise.resolve(this.collection.filter((e: EvidenceSnapshot): boolean => e.countId === countId));
  }

  public override findById(id: string): Promise<Optional<EvidenceSnapshot>> {
    return Promise.resolve(Optional.fromNullable(this.collection.get(id)));
  }
}
