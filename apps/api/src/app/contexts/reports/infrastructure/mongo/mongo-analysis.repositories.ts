import { Injectable } from '@nestjs/common';
import { ReportDefinitionRequest } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model, Schema } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { Classification, ClassificationSnapshot } from '../../domain/classification';
import { ClassificationRepository, ReportDefinitionRepository } from '../../domain/ports';
import { ReportDefinition, ReportDefinitionSnapshot } from '../../domain/report-definition';
import { AnalysisParsers } from '../../application/analysis-parsers';

type ClassificationRecord = Omit<ClassificationSnapshot, 'id'> & { readonly _id: string };
type ReportDefinitionRecord = Omit<ReportDefinitionSnapshot, 'id'> & { readonly _id: string };

const CLASSIFICATION_SCHEMA: Schema<ClassificationRecord> = new Schema<ClassificationRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    fieldKey: { type: String, required: true },
    nodes: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'classifications', versionKey: false, minimize: false },
);

const REPORT_DEFINITION_SCHEMA: Schema<ReportDefinitionRecord> = new Schema<ReportDefinitionRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    rowSource: { type: String, required: true },
    classificationId: { type: String, default: null },
    rowFieldKey: { type: String, default: null },
    classificationColumns: { type: [String], default: [] },
    columns: { type: Schema.Types.Mixed, default: [] },
    profileId: { type: String, default: null },
    scope: { type: Schema.Types.Mixed, default: null },
    periodGrouping: { type: String, default: null },
    columnSplit: { type: [String], default: [] },
    subtotals: { type: Boolean, default: true },
    onlyWhenFieldKey: { type: String, default: null },
    includeUnclassified: { type: Boolean, required: true },
    presentation: { type: Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'report_definitions', versionKey: false, minimize: false },
);

@Injectable()
export class MongoClassificationRepository extends ClassificationRepository {
  private readonly model: Model<ClassificationRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ClassificationRecord>('Classification', CLASSIFICATION_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<Classification>> {
    const record: Nullable<ClassificationRecord> = await this.model
      .findById(id.toString())
      .lean<ClassificationRecord>()
      .exec();
    return Optional.fromNullable(record).map(MongoClassificationRepository.restore);
  }

  public override async findByProject(projectId: EntityId): Promise<Classification[]> {
    const records: ClassificationRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ name: 1 })
      .lean<ClassificationRecord[]>()
      .exec();
    return records.map(MongoClassificationRepository.restore);
  }

  public override async save(classification: Classification): Promise<void> {
    const { id, ...rest } = classification.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }

  public override async delete(id: EntityId): Promise<void> {
    await this.model.deleteOne({ _id: id.toString() }).exec();
  }

  private static restore(record: ClassificationRecord): Classification {
    const { _id, ...rest } = record;
    return Classification.restore({ ...rest, id: _id });
  }
}

@Injectable()
export class MongoReportDefinitionRepository extends ReportDefinitionRepository {
  private readonly model: Model<ReportDefinitionRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ReportDefinitionRecord>(
      'ReportDefinition',
      REPORT_DEFINITION_SCHEMA,
    );
  }

  public override async findById(id: EntityId): Promise<Optional<ReportDefinition>> {
    const record: Nullable<ReportDefinitionRecord> = await this.model
      .findById(id.toString())
      .lean<ReportDefinitionRecord>()
      .exec();
    return Optional.fromNullable(record).map(MongoReportDefinitionRepository.restore);
  }

  public override async findByProject(projectId: EntityId): Promise<ReportDefinition[]> {
    const records: ReportDefinitionRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ name: 1 })
      .lean<ReportDefinitionRecord[]>()
      .exec();
    return records.map(MongoReportDefinitionRepository.restore);
  }

  public override async save(definition: ReportDefinition): Promise<void> {
    const { id, ...rest } = definition.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }

  public override async delete(id: EntityId): Promise<void> {
    await this.model.deleteOne({ _id: id.toString() }).exec();
  }

  /** Los documentos guardados con la forma anterior de los informes se convierten al leerlos. */
  private static restore(record: ReportDefinitionRecord): ReportDefinition {
    const spec: ReportDefinitionRequest = AnalysisParsers.report(record).unwrap();
    return ReportDefinition.restore({
      ...spec,
      id: record._id,
      projectId: record.projectId,
      updatedAt: record.updatedAt,
    });
  }
}
