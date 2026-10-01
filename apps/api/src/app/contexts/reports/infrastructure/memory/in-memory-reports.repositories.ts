import { Injectable } from '@nestjs/common';
import { ImportItemStatus } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { DataSourceProfile, ProfileSnapshot } from '../../domain/data-source-profile';
import { FieldCatalog, FieldCatalogSnapshot } from '../../domain/field-catalog';
import { ImportBatch, ImportBatchSnapshot, ImportItemSnapshot } from '../../domain/import-batch';
import { OrgStructure, OrgStructureSnapshot } from '../../domain/org-structure';
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

@Injectable()
export class InMemoryOrgStructureRepository extends OrgStructureRepository {
  private readonly collection: InMemoryCollection<OrgStructureSnapshot> =
    new InMemoryCollection<OrgStructureSnapshot>();

  public override findByProject(projectId: EntityId): Promise<Optional<OrgStructure>> {
    const found: Nullable<OrgStructureSnapshot> = this.collection.find(
      (s: OrgStructureSnapshot): boolean => s.projectId === projectId.toString(),
    );
    return Promise.resolve(Optional.fromNullable(found).map(OrgStructure.restore));
  }

  public override save(structure: OrgStructure): Promise<void> {
    this.collection.put(structure.toSnapshot());
    return Promise.resolve();
  }
}

@Injectable()
export class InMemoryFieldCatalogRepository extends FieldCatalogRepository {
  private readonly collection: InMemoryCollection<FieldCatalogSnapshot> =
    new InMemoryCollection<FieldCatalogSnapshot>();

  public override findByProject(projectId: EntityId): Promise<Optional<FieldCatalog>> {
    const found: Nullable<FieldCatalogSnapshot> = this.collection.find(
      (s: FieldCatalogSnapshot): boolean => s.projectId === projectId.toString(),
    );
    return Promise.resolve(Optional.fromNullable(found).map(FieldCatalog.restore));
  }

  public override save(catalog: FieldCatalog, expectedVersion: number): Promise<boolean> {
    const snapshot: FieldCatalogSnapshot = catalog.toSnapshot();
    const stored: Nullable<FieldCatalogSnapshot> = this.collection.get(snapshot.id);
    if ((stored === null ? 0 : stored.version) !== expectedVersion) {
      return Promise.resolve(false);
    }
    this.collection.put(snapshot);
    return Promise.resolve(true);
  }
}

@Injectable()
export class InMemoryProfileRepository extends ProfileRepository {
  private readonly collection: InMemoryCollection<ProfileSnapshot> =
    new InMemoryCollection<ProfileSnapshot>();

  public override findById(id: EntityId): Promise<Optional<DataSourceProfile>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.get(id.toString())).map(DataSourceProfile.restore),
    );
  }

  public override findByProject(projectId: EntityId): Promise<DataSourceProfile[]> {
    return Promise.resolve(
      this.collection
        .filter((p: ProfileSnapshot): boolean => p.projectId === projectId.toString())
        .sort((a: ProfileSnapshot, b: ProfileSnapshot): number => a.name.localeCompare(b.name))
        .map(DataSourceProfile.restore),
    );
  }

  public override save(profile: DataSourceProfile): Promise<void> {
    this.collection.put(profile.toSnapshot());
    return Promise.resolve();
  }
}

@Injectable()
export class InMemoryImportBatchRepository extends ImportBatchRepository {
  private readonly collection: InMemoryCollection<ImportBatchSnapshot> =
    new InMemoryCollection<ImportBatchSnapshot>();

  public override findById(id: EntityId): Promise<Optional<ImportBatch>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.get(id.toString())).map(ImportBatch.restore),
    );
  }

  public override findByProject(projectId: EntityId, limit: number): Promise<ImportBatch[]> {
    return Promise.resolve(
      this.collection
        .filter((b: ImportBatchSnapshot): boolean => b.projectId === projectId.toString())
        .sort(
          (a: ImportBatchSnapshot, b: ImportBatchSnapshot): number =>
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .slice(0, limit)
        .map(ImportBatch.restore),
    );
  }

  public override findPublished(projectId: EntityId, scopeKey: string): Promise<ImportBatch[]> {
    return Promise.resolve(
      this.collection
        .filter(
          (b: ImportBatchSnapshot): boolean =>
            b.projectId === projectId.toString() &&
            b.items.some(
              (i: ImportItemSnapshot): boolean =>
                i.status === ImportItemStatus.PUBLISHED && ImportBatch.scopeKey(i) === scopeKey,
            ),
        )
        .map(ImportBatch.restore),
    );
  }

  public override save(batch: ImportBatch): Promise<void> {
    this.collection.put(batch.toSnapshot());
    return Promise.resolve();
  }
}

@Injectable()
export class InMemoryDataRecordRepository extends DataRecordRepository {
  private readonly collection: InMemoryCollection<DataRecordSnapshot> =
    new InMemoryCollection<DataRecordSnapshot>();

  public override insertMany(records: ReadonlyArray<DataRecordSnapshot>): Promise<void> {
    records.forEach((r: DataRecordSnapshot): void => this.collection.put(r));
    return Promise.resolve();
  }

  public override deleteByLoad(loadId: string): Promise<void> {
    this.collection
      .filter((r: DataRecordSnapshot): boolean => r.loadId === loadId)
      .forEach((r: DataRecordSnapshot): void => this.collection.delete(r.id));
    return Promise.resolve();
  }

  public override page(query: RecordQuery, page: number, size: number): Promise<RecordPage> {
    const matches: DataRecordSnapshot[] = this.matching(query);
    return Promise.resolve(new RecordPage(matches.length, matches.slice(page * size, page * size + size)));
  }

  public override async *stream(query: RecordQuery): AsyncIterable<DataRecordSnapshot> {
    for (const record of this.matching(query)) {
      yield await Promise.resolve(record);
    }
  }

  private matching(query: RecordQuery): DataRecordSnapshot[] {
    return this.collection
      .filter(
        (r: DataRecordSnapshot): boolean =>
          r.projectId === query.projectId &&
          (query.period === null || r.period === query.period) &&
          (query.profileId === null || r.profileId === query.profileId) &&
          (query.companyId === null || r.companyId === query.companyId) &&
          (query.loadIds.length === 0 || query.loadIds.includes(r.loadId)),
      )
      .sort(
        (a: DataRecordSnapshot, b: DataRecordSnapshot): number =>
          a.period.localeCompare(b.period) || a.loadId.localeCompare(b.loadId) || a.line - b.line,
      );
  }
}
