import { Injectable } from '@nestjs/common';
import { EntityId, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { Classification, ClassificationSnapshot } from '../../domain/classification';
import { ClassificationRepository, ReportDefinitionRepository } from '../../domain/ports';
import { ReportDefinition, ReportDefinitionSnapshot } from '../../domain/report-definition';

@Injectable()
export class InMemoryClassificationRepository extends ClassificationRepository {
  private readonly collection: InMemoryCollection<ClassificationSnapshot> =
    new InMemoryCollection<ClassificationSnapshot>();

  public override findById(id: EntityId): Promise<Optional<Classification>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.get(id.toString())).map(Classification.restore),
    );
  }

  public override findByProject(projectId: EntityId): Promise<Classification[]> {
    return Promise.resolve(
      this.collection
        .filter((c: ClassificationSnapshot): boolean => c.projectId === projectId.toString())
        .map(Classification.restore),
    );
  }

  public override save(classification: Classification): Promise<void> {
    this.collection.put(classification.toSnapshot());
    return Promise.resolve();
  }

  public override delete(id: EntityId): Promise<void> {
    this.collection.delete(id.toString());
    return Promise.resolve();
  }
}

@Injectable()
export class InMemoryReportDefinitionRepository extends ReportDefinitionRepository {
  private readonly collection: InMemoryCollection<ReportDefinitionSnapshot> =
    new InMemoryCollection<ReportDefinitionSnapshot>();

  public override findById(id: EntityId): Promise<Optional<ReportDefinition>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.get(id.toString())).map(ReportDefinition.restore),
    );
  }

  public override findByProject(projectId: EntityId): Promise<ReportDefinition[]> {
    return Promise.resolve(
      this.collection
        .filter((d: ReportDefinitionSnapshot): boolean => d.projectId === projectId.toString())
        .map(ReportDefinition.restore),
    );
  }

  public override save(definition: ReportDefinition): Promise<void> {
    this.collection.put(definition.toSnapshot());
    return Promise.resolve();
  }

  public override delete(id: EntityId): Promise<void> {
    this.collection.delete(id.toString());
    return Promise.resolve();
  }
}
