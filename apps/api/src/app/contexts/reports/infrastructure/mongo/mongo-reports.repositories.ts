import { Injectable } from '@nestjs/common';
import { ImportItemStatus } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model, QueryFilter } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { DataSourceProfile } from '../../domain/data-source-profile';
import { FieldCatalog } from '../../domain/field-catalog';
import { ImportBatch, ImportItemSnapshot } from '../../domain/import-batch';
import { OrgStructure } from '../../domain/org-structure';
import {
  DataRecordRepository,
  DataRecordSnapshot,
  FieldCatalogRepository,
  ImportBatchRepository,
  OrgStructureRepository,
  ProfileRepository,
  RecordPage,
  RecordQuery,
} from '../../domain/ports';
import {
  DATA_RECORD_SCHEMA,
  DataRecordDocument,
  FIELD_CATALOG_SCHEMA,
  FieldCatalogRecord,
  IMPORT_BATCH_SCHEMA,
  ImportBatchRecord,
  ORG_STRUCTURE_SCHEMA,
  OrgStructureRecord,
  PROFILE_SCHEMA,
  ProfileRecord,
} from './reports.schemas';

class Records {
  public static withoutId<T extends { readonly _id: string }>(
    record: T,
  ): Omit<T, '_id'> & { readonly id: string } {
    const { _id, ...rest } = record;
    return { ...rest, id: _id };
  }
}

@Injectable()
export class MongoOrgStructureRepository extends OrgStructureRepository {
  private readonly model: Model<OrgStructureRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<OrgStructureRecord>('OrgStructure', ORG_STRUCTURE_SCHEMA);
  }

  public override async findByProject(projectId: EntityId): Promise<Optional<OrgStructure>> {
    const record: Nullable<OrgStructureRecord> = await this.model
      .findOne({ projectId: projectId.toString() })
      .lean<OrgStructureRecord>()
      .exec();
    return Optional.fromNullable(record).map((r: OrgStructureRecord): OrgStructure =>
      OrgStructure.restore(Records.withoutId(r)),
    );
  }

  public override async save(structure: OrgStructure): Promise<void> {
    const { id, ...rest } = structure.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}

@Injectable()
export class MongoFieldCatalogRepository extends FieldCatalogRepository {
  private readonly model: Model<FieldCatalogRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<FieldCatalogRecord>('FieldCatalog', FIELD_CATALOG_SCHEMA);
  }

  public override async findByProject(projectId: EntityId): Promise<Optional<FieldCatalog>> {
    const record: Nullable<FieldCatalogRecord> = await this.model
      .findOne({ projectId: projectId.toString() })
      .lean<FieldCatalogRecord>()
      .exec();
    return Optional.fromNullable(record).map((r: FieldCatalogRecord): FieldCatalog =>
      FieldCatalog.restore(Records.withoutId(r)),
    );
  }

  public override async save(catalog: FieldCatalog, expectedVersion: number): Promise<boolean> {
    const { id, ...rest } = catalog.toSnapshot();
    if (expectedVersion === 0) {
      try {
        await this.model.create({ _id: id, ...rest });
        return true;
      } catch {
        return false;
      }
    }
    const result = await this.model
      .replaceOne({ _id: id, version: expectedVersion }, { _id: id, ...rest })
      .exec();
    return result.matchedCount === 1;
  }
}

@Injectable()
export class MongoProfileRepository extends ProfileRepository {
  private readonly model: Model<ProfileRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ProfileRecord>('DataSourceProfile', PROFILE_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<DataSourceProfile>> {
    const record: Nullable<ProfileRecord> = await this.model
      .findById(id.toString())
      .lean<ProfileRecord>()
      .exec();
    return Optional.fromNullable(record).map((r: ProfileRecord): DataSourceProfile =>
      DataSourceProfile.restore(Records.withoutId(r)),
    );
  }

  public override async findByProject(projectId: EntityId): Promise<DataSourceProfile[]> {
    const records: ProfileRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ name: 1 })
      .lean<ProfileRecord[]>()
      .exec();
    return records.map((r: ProfileRecord): DataSourceProfile =>
      DataSourceProfile.restore(Records.withoutId(r)),
    );
  }

  public override async save(profile: DataSourceProfile): Promise<void> {
    const { id, ...rest } = profile.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}

@Injectable()
export class MongoImportBatchRepository extends ImportBatchRepository {
  private readonly model: Model<ImportBatchRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ImportBatchRecord>('ImportBatch', IMPORT_BATCH_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<ImportBatch>> {
    const record: Nullable<ImportBatchRecord> = await this.model
      .findById(id.toString())
      .lean<ImportBatchRecord>()
      .exec();
    return Optional.fromNullable(record).map((r: ImportBatchRecord): ImportBatch =>
      ImportBatch.restore(MongoImportBatchRepository.revive(r)),
    );
  }

  public override async findByProject(projectId: EntityId, limit: number): Promise<ImportBatch[]> {
    const records: ImportBatchRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<ImportBatchRecord[]>()
      .exec();
    return records.map((r: ImportBatchRecord): ImportBatch =>
      ImportBatch.restore(MongoImportBatchRepository.revive(r)),
    );
  }

  public override async findPublished(projectId: EntityId, scopeKey: string): Promise<ImportBatch[]> {
    const records: ImportBatchRecord[] = await this.model
      .find({ projectId: projectId.toString(), 'items.status': ImportItemStatus.PUBLISHED })
      .lean<ImportBatchRecord[]>()
      .exec();
    return records
      .map((r: ImportBatchRecord): ImportBatch => ImportBatch.restore(MongoImportBatchRepository.revive(r)))
      .filter((b: ImportBatch): boolean =>
        b
          .items()
          .some(
            (i: ImportItemSnapshot): boolean =>
              i.status === ImportItemStatus.PUBLISHED && ImportBatch.scopeKey(i) === scopeKey,
          ),
      );
  }

  public override async save(batch: ImportBatch): Promise<void> {
    const { id, ...rest } = batch.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }

  /** Los ítems se guardan como `Mixed`: las fechas vuelven como `Date` desde BSON. */
  private static revive(record: ImportBatchRecord): ReturnType<typeof Records.withoutId<ImportBatchRecord>> {
    return Records.withoutId(record);
  }
}

@Injectable()
export class MongoDataRecordRepository extends DataRecordRepository {
  private readonly model: Model<DataRecordDocument>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<DataRecordDocument>('DataRecord', DATA_RECORD_SCHEMA);
  }

  public override async insertMany(records: ReadonlyArray<DataRecordSnapshot>): Promise<void> {
    if (records.length > 0) {
      await this.model.insertMany(
        records.map((r: DataRecordSnapshot): DataRecordDocument => {
          const { id, ...rest } = r;
          return { _id: id, ...rest };
        }),
        // Sin hidratar ni validar con Mongoose: los registros ya son instantáneas tipadas del dominio
        // y las cargas insertan cientos de miles por archivo.
        { ordered: false, lean: true },
      );
    }
  }

  public override async deleteByLoad(loadId: string): Promise<void> {
    await this.model.deleteMany({ loadId }).exec();
  }

  public override async page(query: RecordQuery, page: number, size: number): Promise<RecordPage> {
    const filter: QueryFilter<DataRecordDocument> = MongoDataRecordRepository.filter(query);
    const [total, rows] = await Promise.all([
      this.model.countDocuments(filter).exec(),
      this.model
        .find(filter)
        .sort({ period: 1, loadId: 1, line: 1 })
        .skip(page * size)
        .limit(size)
        .lean<DataRecordDocument[]>()
        .exec(),
    ]);
    return new RecordPage(
      total,
      rows.map((r: DataRecordDocument): DataRecordSnapshot => Records.withoutId(r)),
    );
  }

  public override async *stream(query: RecordQuery): AsyncIterable<DataRecordSnapshot> {
    const cursor = this.model
      .find(MongoDataRecordRepository.filter(query))
      .lean<DataRecordDocument>()
      .cursor();
    for await (const record of cursor) {
      yield Records.withoutId(record);
    }
  }

  private static filter(query: RecordQuery): QueryFilter<DataRecordDocument> {
    return {
      projectId: query.projectId,
      ...(query.period === null
        ? {}
        : query.periodFrom === null
          ? { period: query.period }
          : { period: { $gte: query.periodFrom, $lte: query.period } }),
      ...(query.profileId === null ? {} : { profileId: query.profileId }),
      ...(query.companyId === null ? {} : { companyId: query.companyId }),
      ...(query.loadIds.length === 0 ? {} : { loadId: { $in: [...query.loadIds] } }),
    };
  }
}
