import { Injectable, Logger } from '@nestjs/common';
import { CheckResultDto, FixedWidthSpec, ImportItemEvent, RealtimeEvent } from '@asisteglt/shared-contracts';
import {
  DataLine,
  FixedWidthReader,
  LineClassification,
  ReadSummary,
  RejectedLine,
  TextEncoding,
  TextLine,
  TextLineSplitter,
  Utf8Probe,
} from '@asisteglt/shared-ingestion-core';
import { Counter, Histogram, MetricsRegistry } from '@asisteglt/api-platform';
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
  private static readonly DURATION_BUCKETS: ReadonlyArray<number> = [0.5, 1, 2.5, 5, 10, 30, 60, 120, 300];
  private readonly logger: Logger = new Logger(ImportProcessor.name);
  private readonly outcomes: Counter;
  private readonly durations: Histogram;
  private readonly lineCounter: Counter;

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
    metrics: MetricsRegistry,
  ) {
    this.outcomes = metrics.counter('asisteglt_imports_total', 'Archivos de carga procesados por resultado');
    this.durations = metrics.histogram(
      'asisteglt_import_duration_seconds',
      'Duración del procesamiento de un archivo de carga',
      ImportProcessor.DURATION_BUCKETS,
    );
    this.lineCounter = metrics.counter(
      'asisteglt_import_lines_total',
      'Líneas leídas en cargas por clasificación',
    );
  }

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
    const startedAt: number = performance.now();
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
    this.measure(batch, itemId, (performance.now() - startedAt) / 1000);
  }

  private measure(batch: ImportBatch, itemId: string, seconds: number): void {
    const done: Nullable<ImportItemSnapshot> = batch.item(itemId);
    const outcome: string = done === null ? 'unknown' : done.status;
    this.outcomes.inc({ outcome });
    this.durations.observe({ outcome }, seconds);
    if (done !== null) {
      this.lineCounter.add({ kind: 'data' }, done.data);
      this.lineCounter.add({ kind: 'rejected' }, done.rejected);
    }
  }

  /**
   * Dos pasadas por bloques sobre el archivo guardado, sin tenerlo completo en memoria (RNF-06):
   * la primera clasifica, cuenta y evalúa los cuadres; solo si el archivo es aceptable, la segunda
   * reemplaza la carga anterior e inserta los registros por lotes.
   */
  private async run(batch: ImportBatch, item: ImportItemSnapshot): Promise<void> {
    const profile: Nullable<DataSourceProfile> = (
      await this.profiles.findById(EntityId.fromString(item.profileId).unwrap())
    ).toNullable();
    if (profile === null || (await this.storage.read(item.storageKey)) === null) {
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
    const created: Result<FixedWidthReader> = FixedWidthReader.create(spec, catalog.labels());
    if (!created.isOk()) {
      batch.fail(item.id, new ReadCounts(0, 0, 0, 0), [], 'La preconfiguración no es válida', this.clock);
      return;
    }
    const reader: FixedWidthReader = created.unwrap();
    const encoding: TextEncoding = await this.encoding(spec.encoding, item.storageKey);
    const checks: BalanceChecks = new BalanceChecks(profile.getChecks(), CatalogResolver.of(catalog));
    const scan: ImportScan = new ImportScan(checks);
    for await (const lines of this.lines(item.storageKey, encoding, spec.tabSize)) {
      for (const line of lines) {
        scan.accept(reader.classify(line));
      }
    }
    const summary: ReadSummary = scan.summary();
    const counts: ReadCounts = new ReadCounts(summary.total, summary.data, summary.ignored, summary.rejected);
    const issues: ImportIssue[] = scan.issues();
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
    let pending: DataRecordSnapshot[] = [];
    for await (const lines of this.lines(item.storageKey, encoding, spec.tabSize)) {
      for (const line of lines) {
        const classified: LineClassification = reader.classify(line);
        if (classified instanceof DataLine) {
          pending.push(ImportProcessor.record(batch, item, classified));
        }
      }
      if (pending.length >= ImportProcessor.CHUNK) {
        await this.records.insertMany(pending);
        pending = [];
      }
    }
    if (pending.length > 0) {
      await this.records.insertMany(pending);
    }
    batch.publish(item.id, counts, issues, results, this.clock);
  }

  /** Líneas del archivo guardado, entregadas por bloque leído. */
  private async *lines(key: string, encoding: TextEncoding, tabSize: number): AsyncGenerator<TextLine[]> {
    const chunks: Nullable<AsyncIterable<Uint8Array>> = await this.storage.read(key);
    if (chunks === null) {
      throw new Error('El archivo de la carga ya no está disponible');
    }
    const decoder: TextDecoder = new TextDecoder(encoding);
    const splitter: TextLineSplitter = new TextLineSplitter(tabSize);
    for await (const chunk of chunks) {
      yield splitter.push(decoder.decode(chunk, { stream: true }));
    }
    yield [...splitter.push(decoder.decode()), ...splitter.finish()];
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

  /** La codificación configurada o, en `auto`, UTF-8 si todo el archivo lo es (si no, Windows-1252). */
  private async encoding(configured: string, key: string): Promise<TextEncoding> {
    const known: Nullable<TextEncoding> =
      Object.values(TextEncoding).find((e: TextEncoding): boolean => e === configured) ?? null;
    if (known !== null) {
      return known;
    }
    const chunks: Nullable<AsyncIterable<Uint8Array>> = await this.storage.read(key);
    const probe: Utf8Probe = new Utf8Probe();
    if (chunks !== null) {
      for await (const chunk of chunks) {
        probe.push(chunk);
      }
    }
    return probe.isValid() ? TextEncoding.UTF8 : TextEncoding.WINDOWS_1252;
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

/** Resumen de la primera pasada: conteos, primeras incidencias y cuadres, sin guardar las líneas. */
class ImportScan {
  private total: number = 0;
  private data: number = 0;
  private ignored: number = 0;
  private rejected: number = 0;
  private readonly found: ImportIssue[] = [];

  public constructor(private readonly checks: BalanceChecks) {}

  public accept(line: LineClassification): void {
    this.total += 1;
    if (line instanceof DataLine) {
      this.data += 1;
      this.checks.add(line.values);
      return;
    }
    if (line instanceof RejectedLine) {
      this.rejected += 1;
      if (this.found.length < ImportBatch.MAX_ISSUES) {
        this.found.push({ line: line.lineNumber, messages: line.issues });
      }
      return;
    }
    this.ignored += 1;
  }

  public summary(): ReadSummary {
    return new ReadSummary(this.total, this.data, this.ignored, this.rejected);
  }

  public issues(): ImportIssue[] {
    return [...this.found];
  }
}
