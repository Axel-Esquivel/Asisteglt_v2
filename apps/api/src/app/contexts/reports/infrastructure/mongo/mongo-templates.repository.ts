import { Injectable } from '@nestjs/common';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model, Schema } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { ReportTemplateRepository } from '../../domain/ports';
import { ReportTemplate, ReportTemplateSnapshot } from '../../domain/report-template';

type ReportTemplateRecord = Omit<ReportTemplateSnapshot, 'id'> & { readonly _id: string };

const REPORT_TEMPLATE_SCHEMA: Schema<ReportTemplateRecord> = new Schema<ReportTemplateRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    version: { type: Number, required: true },
    pages: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'report_templates', versionKey: false, minimize: false },
);

@Injectable()
export class MongoReportTemplateRepository extends ReportTemplateRepository {
  private readonly model: Model<ReportTemplateRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ReportTemplateRecord>('ReportTemplate', REPORT_TEMPLATE_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<ReportTemplate>> {
    const record: Nullable<ReportTemplateRecord> = await this.model
      .findById(id.toString())
      .lean<ReportTemplateRecord>()
      .exec();
    return Optional.fromNullable(record).map(MongoReportTemplateRepository.restore);
  }

  public override async findByProject(projectId: EntityId): Promise<ReportTemplate[]> {
    const records: ReportTemplateRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ name: 1 })
      .lean<ReportTemplateRecord[]>()
      .exec();
    return records.map(MongoReportTemplateRepository.restore);
  }

  public override async save(template: ReportTemplate): Promise<void> {
    const { id, ...rest } = template.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }

  public override async delete(id: EntityId): Promise<void> {
    await this.model.deleteOne({ _id: id.toString() }).exec();
  }

  private static restore(record: ReportTemplateRecord): ReportTemplate {
    const { _id, ...rest } = record;
    return ReportTemplate.restore({ ...rest, id: _id });
  }
}
