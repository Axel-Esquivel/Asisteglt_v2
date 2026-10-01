import { Injectable } from '@nestjs/common';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model, Schema } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { CollectionRepository } from '../../domain/ports';
import { CollectionSnapshot, SupplementaryCollection } from '../../domain/supplementary-collection';

type CollectionRecord = Omit<CollectionSnapshot, 'id'> & { readonly _id: string };

const COLLECTION_SCHEMA: Schema<CollectionRecord> = new Schema<CollectionRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    fields: { type: Schema.Types.Mixed, required: true },
    rows: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'supplementary_collections', versionKey: false, minimize: false },
);

@Injectable()
export class MongoCollectionRepository extends CollectionRepository {
  private readonly model: Model<CollectionRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<CollectionRecord>('SupplementaryCollection', COLLECTION_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<SupplementaryCollection>> {
    const record: Nullable<CollectionRecord> = await this.model
      .findById(id.toString())
      .lean<CollectionRecord>()
      .exec();
    return Optional.fromNullable(record).map(MongoCollectionRepository.restore);
  }

  public override async findByProject(projectId: EntityId): Promise<SupplementaryCollection[]> {
    const records: CollectionRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ name: 1 })
      .lean<CollectionRecord[]>()
      .exec();
    return records.map(MongoCollectionRepository.restore);
  }

  public override async save(collection: SupplementaryCollection): Promise<void> {
    const { id, ...rest } = collection.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }

  public override async delete(id: EntityId): Promise<void> {
    await this.model.deleteOne({ _id: id.toString() }).exec();
  }

  private static restore(record: CollectionRecord): SupplementaryCollection {
    const { _id, ...rest } = record;
    return SupplementaryCollection.restore({ ...rest, id: _id });
  }
}
