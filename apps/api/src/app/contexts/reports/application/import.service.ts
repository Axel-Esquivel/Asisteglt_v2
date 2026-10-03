import { createReadStream } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { ImportItemRequest, ImportManifest, IngestionErrorCode } from '@asisteglt/shared-contracts';
import { Clock, EntityId, NotFoundError, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import { DataSourceProfile } from '../domain/data-source-profile';
import { ImportBatch, NewImportItem } from '../domain/import-batch';
import { EntityScope, OrgStructure } from '../domain/org-structure';
import { FileStorage, ImportBatchRepository, ImportQueue, StoredObject } from '../domain/ports';
import { OrgStructureService } from './org-structure.service';
import { ProfileService } from './profile.service';
import { ReportsAccess } from './reports-access';

/** Archivo recibido en la petición (independiente de multer); se lee por bloques. */
export abstract class UploadedContent {
  protected constructor(
    public readonly fileName: string,
    public readonly size: number,
  ) {}

  /** Contenido ya en memoria (datos de demostración y pruebas). */
  public static fromBytes(fileName: string, bytes: Uint8Array): UploadedContent {
    return new BufferedUpload(fileName, bytes);
  }

  /** Archivo temporal en disco escrito por la subida (cargas grandes). */
  public static fromFile(fileName: string, path: string, size: number): UploadedContent {
    return new DiskUpload(fileName, path, size);
  }

  public abstract chunks(): AsyncIterable<Uint8Array>;
}

class BufferedUpload extends UploadedContent {
  public constructor(
    fileName: string,
    private readonly bytes: Uint8Array,
  ) {
    super(fileName, bytes.byteLength);
  }

  public override async *chunks(): AsyncGenerator<Uint8Array> {
    await Promise.resolve();
    yield this.bytes;
  }
}

class DiskUpload extends UploadedContent {
  public constructor(
    fileName: string,
    private readonly path: string,
    size: number,
  ) {
    super(fileName, size);
  }

  public override chunks(): AsyncIterable<Uint8Array> {
    return createReadStream(this.path, { highWaterMark: 1024 * 1024 });
  }
}

/** Recibe un lote de archivos con sus propiedades, lo valida por fila y lo encola (docs/12 §4). */
@Injectable()
export class ImportService {
  /** Tamaño máximo por archivo: se recibe en disco y se procesa por bloques (RNF-06). */
  public static readonly MAX_FILE_BYTES: number = 200 * 1024 * 1024;
  public static readonly MAX_FILES: number = 20;

  public constructor(
    private readonly batches: ImportBatchRepository,
    private readonly storage: FileStorage,
    private readonly queue: ImportQueue,
    private readonly profiles: ProfileService,
    private readonly org: OrgStructureService,
    private readonly access: ReportsAccess,
    private readonly clock: Clock,
  ) {}

  public async submit(
    projectId: string,
    userId: EntityId,
    manifest: ImportManifest,
    files: ReadonlyArray<UploadedContent>,
  ): Promise<Result<ImportBatch>> {
    return (await this.access.load(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<ImportBatch>> => {
        if (
          files.length === 0 ||
          files.length > ImportService.MAX_FILES ||
          files.length !== manifest.items.length
        ) {
          return ImportService.invalid(
            `Envía entre 1 y ${String(ImportService.MAX_FILES)} archivos, cada uno con sus propiedades`,
          );
        }
        const structure: OrgStructure = await this.org.of(project.getId());
        const items: NewImportItem[] = [];
        const keys: Set<string> = new Set<string>();
        for (let index = 0; index < files.length; index += 1) {
          const file: Nullable<UploadedContent> = files[index] ?? null;
          const request: Nullable<ImportItemRequest> = manifest.items[index] ?? null;
          if (file === null || request === null) {
            return ImportService.invalid('Falta un archivo o sus propiedades');
          }
          const item: Result<NewImportItem> = await this.prepare(project, structure, file, request);
          if (!item.isOk()) {
            return Result.fail(
              item.errorOrNull() ??
                new ValidationError(IngestionErrorCode.INVALID_IMPORT, 'Archivo inválido'),
            );
          }
          const prepared: NewImportItem = item.unwrap();
          const key: string = [prepared.profileId, prepared.period, prepared.scope.key()].join('|');
          if (keys.has(key)) {
            return ImportService.invalid(
              `«${file.fileName}» duplica la preconfiguración, el período y el alcance de otro archivo del lote`,
            );
          }
          keys.add(key);
          items.push(prepared);
        }
        const batch: ImportBatch = ImportBatch.open(project.getId(), userId, items, this.clock);
        await this.batches.save(batch);
        for (const item of batch.items()) {
          this.queue.enqueue(batch.getId().toString(), item.id);
        }
        return Result.ok(batch);
      },
    );
  }

  public async list(projectId: string, userId: EntityId): Promise<Result<ImportBatch[]>> {
    return (await this.access.view(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<ImportBatch[]>> =>
        Result.ok(await this.batches.findByProject(project.getId(), 50)),
    );
  }

  public async get(projectId: string, userId: EntityId, batchId: string): Promise<Result<ImportBatch>> {
    return (await this.access.view(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<ImportBatch>> => {
        const id: Result<EntityId> = EntityId.fromString(batchId);
        const batch: Nullable<ImportBatch> = id.isOk()
          ? (await this.batches.findById(id.unwrap()))
              .filter((b: ImportBatch): boolean => b.getProjectId().equals(project.getId()))
              .toNullable()
          : null;
        return batch === null
          ? Result.fail(new NotFoundError(IngestionErrorCode.IMPORT_NOT_FOUND, 'La carga no existe'))
          : Result.ok(batch);
      },
    );
  }

  private async prepare(
    project: Project,
    structure: OrgStructure,
    file: UploadedContent,
    request: ImportItemRequest,
  ): Promise<Result<NewImportItem>> {
    if (file.size === 0 || file.size > ImportService.MAX_FILE_BYTES) {
      return ImportService.invalid(
        `«${file.fileName}» está vacío o supera los ${String(ImportService.MAX_FILE_BYTES / 1024 / 1024)} MB`,
      );
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(request.period)) {
      return ImportService.invalid(`«${file.fileName}»: el período debe tener el formato AAAA-MM`);
    }
    const profile: Result<DataSourceProfile> = await this.profiles.find(project, request.profileId);
    if (!profile.isOk() || !profile.unwrap().isActive()) {
      return ImportService.invalid(`«${file.fileName}»: la preconfiguración no existe o no está activa`);
    }
    if (!profile.unwrap().accepts(file.fileName)) {
      return ImportService.invalid(
        `«${file.fileName}»: la preconfiguración ${profile.unwrap().getName()} no acepta esta extensión`,
      );
    }
    const scope: Result<EntityScope> = structure.scope(
      request.organizationId,
      request.countryId,
      request.currency.trim().toUpperCase(),
      request.companyId,
      request.enterpriseId,
      request.branchId,
    );
    if (!scope.isOk()) {
      return Result.fail(
        scope.errorOrNull() ?? new ValidationError(IngestionErrorCode.INVALID_IMPORT, 'Alcance inválido'),
      );
    }
    const storageKey: string = `${project.getId().toString()}/${EntityId.generate().toString()}`;
    const stored: StoredObject = await this.storage.write(storageKey, file.chunks());
    return Result.ok({
      fileName: file.fileName,
      size: stored.size,
      hash: stored.sha256,
      storageKey,
      profileId: profile.unwrap().getId().toString(),
      profileName: profile.unwrap().getName(),
      profileVersion: profile.unwrap().getVersion(),
      period: request.period,
      scope: scope.unwrap(),
    });
  }

  private static invalid<T>(message: string): Result<T> {
    return Result.fail(new ValidationError(IngestionErrorCode.INVALID_IMPORT, message));
  }
}
