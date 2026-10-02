import { Injectable } from '@nestjs/common';
import { EntityId, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { ReportTemplateRepository } from '../../domain/ports';
import { ReportTemplate, ReportTemplateSnapshot } from '../../domain/report-template';

@Injectable()
export class InMemoryReportTemplateRepository extends ReportTemplateRepository {
  private readonly collection: InMemoryCollection<ReportTemplateSnapshot> =
    new InMemoryCollection<ReportTemplateSnapshot>();

  public override findById(id: EntityId): Promise<Optional<ReportTemplate>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.get(id.toString())).map(ReportTemplate.restore),
    );
  }

  public override findByProject(projectId: EntityId): Promise<ReportTemplate[]> {
    return Promise.resolve(
      this.collection
        .filter((t: ReportTemplateSnapshot): boolean => t.projectId === projectId.toString())
        .map(ReportTemplate.restore),
    );
  }

  public override save(template: ReportTemplate): Promise<void> {
    this.collection.put(template.toSnapshot());
    return Promise.resolve();
  }

  public override delete(id: EntityId): Promise<void> {
    this.collection.delete(id.toString());
    return Promise.resolve();
  }
}
