import { Injectable } from '@nestjs/common';
import { Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model, Schema } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { EvidenceSnapshot } from '../../domain/inventory-records';
import { EvidenceRepository } from '../../domain/ports';

type EvidenceRecord = Omit<EvidenceSnapshot, 'id'> & { readonly _id: string };

const EVIDENCE_SCHEMA: Schema<EvidenceRecord> = new Schema<EvidenceRecord>(
  {
    _id: { type: String, required: true },
    countId: { type: String, required: true, index: true },
    itemId: { type: String, required: true },
    round: { type: Number, required: true },
    userId: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    storageKey: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'inventory_evidence', versionKey: false },
);

@Injectable()
export class MongoEvidenceRepository extends EvidenceRepository {
  private readonly model: Model<EvidenceRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<EvidenceRecord>('InventoryEvidence', EVIDENCE_SCHEMA);
  }

  public override async add(evidence: EvidenceSnapshot): Promise<void> {
    const { id, ...rest } = evidence;
    await this.model.create({ _id: id, ...rest });
  }

  public override async findByCount(countId: string): Promise<EvidenceSnapshot[]> {
    const records: EvidenceRecord[] = await this.model
      .find({ countId })
      .sort({ createdAt: 1 })
      .lean<EvidenceRecord[]>()
      .exec();
    return records.map(MongoEvidenceRepository.restore);
  }

  public override async findById(id: string): Promise<Optional<EvidenceSnapshot>> {
    const record: Nullable<EvidenceRecord> = await this.model.findById(id).lean<EvidenceRecord>().exec();
    return Optional.fromNullable(record).map(MongoEvidenceRepository.restore);
  }

  private static restore(record: EvidenceRecord): EvidenceSnapshot {
    const { _id, ...rest } = record;
    return { ...rest, id: _id };
  }
}
