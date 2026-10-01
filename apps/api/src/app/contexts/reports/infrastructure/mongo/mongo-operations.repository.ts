import { Injectable } from '@nestjs/common';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model, Schema } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { OperationPipeline, OperationPipelineSnapshot } from '../../domain/operation-pipeline';
import { OperationPipelineRepository } from '../../domain/ports';

type OperationPipelineRecord = Omit<OperationPipelineSnapshot, 'id'> & { readonly _id: string };

const OPERATION_PIPELINE_SCHEMA: Schema<OperationPipelineRecord> = new Schema<OperationPipelineRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, unique: true },
    version: { type: Number, required: true },
    steps: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'operation_pipelines', versionKey: false, minimize: false },
);

@Injectable()
export class MongoOperationPipelineRepository extends OperationPipelineRepository {
  private readonly model: Model<OperationPipelineRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<OperationPipelineRecord>(
      'OperationPipeline',
      OPERATION_PIPELINE_SCHEMA,
    );
  }

  public override async findByProject(projectId: EntityId): Promise<Optional<OperationPipeline>> {
    const record: Nullable<OperationPipelineRecord> = await this.model
      .findOne({ projectId: projectId.toString() })
      .lean<OperationPipelineRecord>()
      .exec();
    return Optional.fromNullable(record).map((r: OperationPipelineRecord): OperationPipeline => {
      const { _id, ...rest } = r;
      return OperationPipeline.restore({ ...rest, id: _id });
    });
  }

  public override async save(pipeline: OperationPipeline): Promise<void> {
    const { id, ...rest } = pipeline.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}
