import { Injectable } from '@nestjs/common';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model, Schema } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { InventoryCount, InventoryCountSnapshot } from '../../domain/inventory-count';
import { CountEntrySnapshot, InventoryItemSnapshot } from '../../domain/inventory-records';
import { CountEntryRepository, InventoryCountRepository, InventoryItemRepository } from '../../domain/ports';

type CountRecord = Omit<InventoryCountSnapshot, 'id'> & { readonly _id: string };
type ItemRecord = Omit<InventoryItemSnapshot, 'id'> & { readonly _id: string };
type EntryRecord = Omit<CountEntrySnapshot, 'id'> & { readonly _id: string };

const COUNT_SCHEMA: Schema<CountRecord> = new Schema<CountRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    warehouse: { type: String, default: '' },
    status: { type: String, required: true },
    toleranceKind: { type: String, required: true },
    toleranceValue: { type: String, required: true },
    maxRounds: { type: Number, required: true },
    itemCount: { type: Number, required: true },
    participants: { type: Schema.Types.Mixed, required: true },
    rounds: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'inventory_counts', versionKey: false, minimize: false },
);

const ITEM_SCHEMA: Schema<ItemRecord> = new Schema<ItemRecord>(
  {
    _id: { type: String, required: true },
    countId: { type: String, required: true, index: true },
    sku: { type: String, required: true },
    description: { type: String, default: '' },
    unit: { type: String, default: '' },
    location: { type: String, required: true },
    expectedQuantity: { type: String, required: true },
    unitCost: { type: String, default: null },
  },
  { collection: 'inventory_items', versionKey: false },
);

const ENTRY_SCHEMA: Schema<EntryRecord> = new Schema<EntryRecord>(
  {
    _id: { type: String, required: true },
    countId: { type: String, required: true, index: true },
    round: { type: Number, required: true },
    itemId: { type: String, required: true },
    counterId: { type: String, required: true },
    quantity: { type: String, required: true },
    comment: { type: String, default: '' },
    recordedAt: { type: Date, required: true },
  },
  { collection: 'inventory_count_entries', versionKey: false },
);

@Injectable()
export class MongoInventoryCountRepository extends InventoryCountRepository {
  private readonly model: Model<CountRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<CountRecord>('InventoryCount', COUNT_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<InventoryCount>> {
    const record: Nullable<CountRecord> = await this.model.findById(id.toString()).lean<CountRecord>().exec();
    return Optional.fromNullable(record).map(MongoInventoryCountRepository.restore);
  }

  public override async findByProject(projectId: EntityId): Promise<InventoryCount[]> {
    const records: CountRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ createdAt: -1 })
      .lean<CountRecord[]>()
      .exec();
    return records.map(MongoInventoryCountRepository.restore);
  }

  public override async save(count: InventoryCount): Promise<void> {
    const { id, ...rest } = count.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }

  private static restore(record: CountRecord): InventoryCount {
    const { _id, ...rest } = record;
    return InventoryCount.restore({ ...rest, id: _id });
  }
}

@Injectable()
export class MongoInventoryItemRepository extends InventoryItemRepository {
  private readonly model: Model<ItemRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ItemRecord>('InventoryItem', ITEM_SCHEMA);
  }

  public override async replaceForCount(
    countId: string,
    items: ReadonlyArray<InventoryItemSnapshot>,
  ): Promise<void> {
    await this.model.deleteMany({ countId }).exec();
    if (items.length > 0) {
      await this.model.insertMany(
        items.map((i: InventoryItemSnapshot): ItemRecord => {
          const { id, ...rest } = i;
          return { _id: id, ...rest };
        }),
      );
    }
  }

  public override async findByCount(countId: string): Promise<InventoryItemSnapshot[]> {
    const records: ItemRecord[] = await this.model.find({ countId }).lean<ItemRecord[]>().exec();
    return records.map((r: ItemRecord): InventoryItemSnapshot => {
      const { _id, ...rest } = r;
      return { ...rest, id: _id };
    });
  }
}

@Injectable()
export class MongoCountEntryRepository extends CountEntryRepository {
  private readonly model: Model<EntryRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<EntryRecord>('CountEntry', ENTRY_SCHEMA);
  }

  public override async add(entry: CountEntrySnapshot): Promise<void> {
    const { id, ...rest } = entry;
    await this.model.create({ _id: id, ...rest });
  }

  public override async findByCount(countId: string): Promise<CountEntrySnapshot[]> {
    const records: EntryRecord[] = await this.model.find({ countId }).lean<EntryRecord[]>().exec();
    return records.map((r: EntryRecord): CountEntrySnapshot => {
      const { _id, ...rest } = r;
      return { ...rest, id: _id };
    });
  }
}
