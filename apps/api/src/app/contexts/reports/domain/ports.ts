import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { DataSourceProfile } from './data-source-profile';
import { FieldCatalog } from './field-catalog';
import { ImportBatch } from './import-batch';
import { Classification } from './classification';
import { OperationPipeline } from './operation-pipeline';
import { OrgStructure } from './org-structure';
import { ReportDefinition } from './report-definition';
import { SupplementaryCollection } from './supplementary-collection';

export abstract class OrgStructureRepository {
  public abstract findByProject(projectId: EntityId): Promise<Optional<OrgStructure>>;
  public abstract save(structure: OrgStructure): Promise<void>;
}

export abstract class FieldCatalogRepository {
  public abstract findByProject(projectId: EntityId): Promise<Optional<FieldCatalog>>;
  /** Guarda con concurrencia optimista: falla si la versión guardada no es `expectedVersion`. */
  public abstract save(catalog: FieldCatalog, expectedVersion: number): Promise<boolean>;
}

export abstract class ProfileRepository {
  public abstract findById(id: EntityId): Promise<Optional<DataSourceProfile>>;
  public abstract findByProject(projectId: EntityId): Promise<DataSourceProfile[]>;
  public abstract save(profile: DataSourceProfile): Promise<void>;
}

export abstract class ImportBatchRepository {
  public abstract findById(id: EntityId): Promise<Optional<ImportBatch>>;
  public abstract findByProject(projectId: EntityId, limit: number): Promise<ImportBatch[]>;
  /** Lotes con un ítem publicado para la misma preconfiguración, período y alcance. */
  public abstract findPublished(projectId: EntityId, scopeKey: string): Promise<ImportBatch[]>;
  public abstract save(batch: ImportBatch): Promise<void>;
}

export interface DataRecordSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly loadId: string;
  readonly profileId: string;
  readonly period: string;
  readonly organizationId: string;
  readonly countryId: string;
  readonly currency: string;
  readonly companyId: string;
  readonly enterpriseId: Nullable<string>;
  readonly branchId: Nullable<string>;
  readonly line: number;
  readonly values: Readonly<Record<string, CellValue>>;
}

export class RecordQuery {
  public constructor(
    public readonly projectId: string,
    public readonly period: Nullable<string>,
    public readonly profileId: Nullable<string>,
    public readonly companyId: Nullable<string>,
    public readonly loadIds: ReadonlyArray<string>,
    /** Con valor, el filtro de período es el rango [periodFrom, period]. */
    public readonly periodFrom: Nullable<string>,
  ) {}

  public matchesPeriod(period: string): boolean {
    if (this.period === null) {
      return true;
    }
    return this.periodFrom === null
      ? period === this.period
      : period >= this.periodFrom && period <= this.period;
  }
}

export class RecordPage {
  public constructor(
    public readonly total: number,
    public readonly rows: ReadonlyArray<DataRecordSnapshot>,
  ) {}
}

/** Registros publicados (`data_records`), con valores bajo la clave de cada encabezado. */
export abstract class DataRecordRepository {
  public abstract insertMany(records: ReadonlyArray<DataRecordSnapshot>): Promise<void>;
  public abstract deleteByLoad(loadId: string): Promise<void>;
  public abstract page(query: RecordQuery, page: number, size: number): Promise<RecordPage>;
  public abstract stream(query: RecordQuery): AsyncIterable<DataRecordSnapshot>;
}

/** Almacén de archivos cargados (memoria o disco local; los datos nunca van al repositorio). */
export abstract class FileStorage {
  public abstract put(key: string, content: Uint8Array): Promise<void>;
  public abstract get(key: string): Promise<Nullable<Uint8Array>>;
}

/** Cola de procesamiento de ítems de importación. */
export abstract class ImportQueue {
  public abstract enqueue(batchId: string, itemId: string): void;
  public abstract idle(): Promise<void>;
}

export abstract class ClassificationRepository {
  public abstract findById(id: EntityId): Promise<Optional<Classification>>;
  public abstract findByProject(projectId: EntityId): Promise<Classification[]>;
  public abstract save(classification: Classification): Promise<void>;
  public abstract delete(id: EntityId): Promise<void>;
}

export abstract class ReportDefinitionRepository {
  public abstract findById(id: EntityId): Promise<Optional<ReportDefinition>>;
  public abstract findByProject(projectId: EntityId): Promise<ReportDefinition[]>;
  public abstract save(definition: ReportDefinition): Promise<void>;
  public abstract delete(id: EntityId): Promise<void>;
}

export abstract class OperationPipelineRepository {
  public abstract findByProject(projectId: EntityId): Promise<Optional<OperationPipeline>>;
  public abstract save(pipeline: OperationPipeline): Promise<void>;
}

export abstract class CollectionRepository {
  public abstract findById(id: EntityId): Promise<Optional<SupplementaryCollection>>;
  public abstract findByProject(projectId: EntityId): Promise<SupplementaryCollection[]>;
  public abstract save(collection: SupplementaryCollection): Promise<void>;
  public abstract delete(id: EntityId): Promise<void>;
}
