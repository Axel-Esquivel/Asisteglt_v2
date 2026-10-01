import { Injectable, Logger } from '@nestjs/common';
import { CheckResultDto, FixedWidthSpec, ImportItemEvent, RealtimeEvent } from '@asisteglt/shared-contracts';
import {
  DataLine,
  FixedWidthReader,
  LineClassification,
  ReadSummary,
  RejectedLine,
  TextDocument,
  TextEncoding,
} from '@asisteglt/shared-ingestion-core';
import { Clock, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { RealtimeEventPublisher, UsersAudience } from '../../chat/domain/ports';
import { Project, ProjectMember } from '../../projects/domain/project';
import { ProjectRepository } from '../../projects/domain/ports';
import { AppConfig } from '../../../config/app-config';
import { BalanceChecks } from '../domain/balance-checks';
import { CatalogResolver } from '../domain/catalog-resolver';
import { DataSourceProfile } from '../domain/data-source-profile';
import { ImportBatch, ImportIssue, ImportItemSnapshot, ReadCounts } from '../domain/import-batch';
import {
  DataRecordRepository,
  DataRecordSnapshot,
  FileStorage,
  ImportBatchRepository,
  ProfileRepository,
} from '../domain/ports';
import { CatalogService } from './catalog.service';
import { ImportPresenter } from './import.presenter';

/**
 * Procesa un archivo del lote con `ingestion-core` (el mismo lector de la vista previa):
 * clasifica las líneas, rechaza si supera el umbral y publica reemplazando la carga anterior.
 */
@Injectable()
export class ImportProcessor {
  private static readonly CHUNK: number = 1000;
  private readonly logger: Logger = new Logger(ImportProcessor.name);

  public constructor(
    private readonly batches: ImportBatchRepository,
    private readonly profiles: ProfileRepository,
    private readonly records: DataRecordRepository,
    private readonly storage: FileStorage,
    private readonly catalogs: CatalogService,
    private readonly projects: ProjectRepository,
    private readonly publisher: RealtimeEventPublisher,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  public async process(batchId: string, itemId: string): Promise<void> {
    const batch: Nullable<ImportBatch> = (
      await this.batches.findById(EntityId.fromString(batchId).unwrap())
    ).toNullable();
    const item: Nullable<ImportItemSnapshot> = batch === null ? null : batch.item(itemId);
    if (batch === null || item === null) {
      return;
    }
    batch.start(itemId);
    await this.save(batch, itemId);
    try {
      await this.run(batch, item);
    } catch (error: unknown) {
      this.logger.error(
        `Fallo al importar el ítem ${itemId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      batch.fail(
        itemId,
        new ReadCounts(0, 0, 0, 0),
        [],
        'Error inesperado al procesar el archivo',
        this.clock,
      );
    }
    await this.save(batch, itemId);
  }

  private async run(batch: ImportBatch, item: ImportItemSnapshot): Promise<void> {
    const profile: Nullable<DataSourceProfile> = (
      await this.profiles.findById(EntityId.fromString(item.profileId).unwrap())
    ).toNullable();
    const bytes: Nullable<Uint8Array> = await this.storage.get(item.storageKey);
    if (profile === null || bytes === null) {
      batch.fail(
        item.id,
        new ReadCounts(0, 0, 0, 0),
        [],
        'No se encontró el archivo o la preconfiguración',
        this.clock,
      );
      return;
    }
    const spec: FixedWidthSpec = profile.getSpec();
    const catalog = await this.catalogs.of(batch.getProjectId());
    const reader: Result<FixedWidthReader> = FixedWidthReader.create(spec, catalog.labels());
    if (!reader.isOk()) {
      batch.fail(item.id, new ReadCounts(0, 0, 0, 0), [], 'La preconfiguración no es válida', this.clock);
      return;
    }
    const encoding: TextEncoding = ImportProcessor.encoding(spec.encoding, bytes);
    const document: TextDocument = TextDocument.decode(bytes, encoding, spec.tabSize);
    const lines: LineClassification[] = reader.unwrap().classifyAll(document.all());
    const summary: ReadSummary = FixedWidthReader.summarize(lines);
    const counts: ReadCounts = new ReadCounts(summary.total, summary.data, summary.ignored, summary.rejected);
    const issues: ImportIssue[] = lines
      .filter((l: LineClassification): l is RejectedLine => l instanceof RejectedLine)
      .slice(0, ImportBatch.MAX_ISSUES)
      .map((l: RejectedLine): ImportIssue => ({ line: l.lineNumber, messages: l.issues }));
    if (summary.data === 0) {
      batch.fail(
        item.id,
        counts,
        issues,
        'El archivo no tiene líneas de datos con esta preconfiguración',
        this.clock,
      );
      return;
    }
    if (summary.rejectedRatio() > this.config.importRejectThreshold) {
      const percent: string = (summary.rejectedRatio() * 100).toFixed(1);
      batch.fail(
        item.id,
        counts,
        issues,
        `${percent} % de líneas rechazadas supera el umbral; revisa las divisorias o las máscaras`,
        this.clock,
      );
      return;
    }
    const data: DataLine[] = lines.filter((l: LineClassification): l is DataLine => l instanceof DataLine);
    const checks: BalanceChecks = new BalanceChecks(profile.getChecks(), CatalogResolver.of(catalog));
    for (const line of data) {
      checks.add(line.values);
    }
    const results: CheckResultDto[] = checks.results();
    const blocking: Nullable<CheckResultDto> =
      results.find((r: CheckResultDto): boolean => r.blocking && !r.passed) ?? null;
    if (blocking !== null) {
      batch.reject(
        item.id,
        counts,
        issues,
        results,
        `No cuadra «${blocking.label}»: ${blocking.left ?? 'vacío'} contra ${blocking.right ?? 'vacío'}`,
        this.clock,
      );
      return;
    }
    await this.replacePrevious(batch, item);
    for (let start = 0; start < data.length; start += ImportProcessor.CHUNK) {
      await this.records.insertMany(
        data
          .slice(start, start + ImportProcessor.CHUNK)
          .map((line: DataLine): DataRecordSnapshot => ImportProcessor.record(batch, item, line)),
      );
    }
    batch.publish(item.id, counts, issues, results, this.clock);
  }

  /** Una sola versión vigente por preconfiguración, período y alcance: la anterior queda reemplazada. */
  private async replacePrevious(batch: ImportBatch, item: ImportItemSnapshot): Promise<void> {
    const key: string = ImportBatch.scopeKey(item);
    for (const previous of await this.batches.findPublished(batch.getProjectId(), key)) {
      const target: ImportBatch = previous.getId().equals(batch.getId()) ? batch : previous;
      for (const old of target.items()) {
        if (old.id !== item.id && ImportBatch.scopeKey(old) === key) {
          await this.records.deleteByLoad(old.id);
          target.supersede(old.id);
        }
      }
      if (target !== batch) {
        await this.batches.save(target);
      }
    }
  }

  private async save(batch: ImportBatch, itemId: string): Promise<void> {
    await this.batches.save(batch);
    const item: Nullable<ImportItemSnapshot> = batch.item(itemId);
    const project: Nullable<Project> = (await this.projects.findById(batch.getProjectId())).toNullable();
    if (item !== null && project !== null) {
      const event: ImportItemEvent = {
        projectId: project.getId().toString(),
        item: ImportPresenter.item(batch, item),
      };
      this.publisher.publish(
        new UsersAudience(project.getMembers().map((m: ProjectMember): EntityId => m.userId)),
        RealtimeEvent.IMPORT_ITEM,
        event,
      );
    }
  }

  private static encoding(configured: string, bytes: Uint8Array): TextEncoding {
    const known: Nullable<TextEncoding> =
      Object.values(TextEncoding).find((e: TextEncoding): boolean => e === configured) ?? null;
    return known === null ? TextDocument.detectEncoding(bytes) : known;
  }

  private static record(batch: ImportBatch, item: ImportItemSnapshot, line: DataLine): DataRecordSnapshot {
    return {
      id: EntityId.generate().toString(),
      projectId: batch.getProjectId().toString(),
      loadId: item.id,
      profileId: item.profileId,
      period: item.period,
      organizationId: item.organizationId,
      countryId: item.countryId,
      currency: item.currency,
      companyId: item.companyId,
      enterpriseId: item.enterpriseId,
      branchId: item.branchId,
      line: line.lineNumber,
      values: line.values,
    };
  }
}
