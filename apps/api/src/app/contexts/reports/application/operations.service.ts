import { Injectable } from '@nestjs/common';
import {
  OperationKind,
  OperationStepDto,
  OperationsRequest,
  OperationsResponse,
} from '@asisteglt/shared-contracts';
import { FormulaFormatter, ListFieldResolver } from '@asisteglt/shared-formula-engine';
import { Clock, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import { FieldCatalog } from '../domain/field-catalog';
import { OperationPipeline } from '../domain/operation-pipeline';
import { CollectionRates } from '../domain/collection-rates';
import { HistorySource, OperationRunner } from '../domain/operation-runner';
import { SupplementaryCollection } from '../domain/supplementary-collection';
import {
  CollectionRepository,
  DataRecordRepository,
  DataRecordSnapshot,
  OperationPipelineRepository,
  RecordQuery,
} from '../domain/ports';
import { CatalogResolver } from '../domain/catalog-resolver';
import { CatalogService } from './catalog.service';
import { ReportsAccess } from './reports-access';

/** Historia de un proyecto (todas las cargas vigentes) bajo los filtros de la consulta original. */
class RepositoryHistory extends HistorySource {
  public constructor(
    private readonly records: DataRecordRepository,
    private readonly base: RecordQuery,
  ) {
    super();
  }

  public override between(periodFrom: string, periodTo: string): AsyncIterable<DataRecordSnapshot> {
    return this.records.stream(
      new RecordQuery(
        this.base.projectId,
        periodTo,
        this.base.profileId,
        this.base.companyId,
        [],
        periodFrom,
      ),
    );
  }
}

/** Operaciones del proyecto: edición y ejecución sobre los registros consultados. */
@Injectable()
export class OperationsService {
  public constructor(
    private readonly pipelines: OperationPipelineRepository,
    private readonly records: DataRecordRepository,
    private readonly collections: CollectionRepository,
    private readonly catalogs: CatalogService,
    private readonly access: ReportsAccess,
    private readonly clock: Clock,
  ) {}

  public async get(projectId: string, userId: EntityId): Promise<Result<OperationsResponse>> {
    return (await this.access.read(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<OperationsResponse>> =>
        Result.ok(this.present(await this.of(p.getId()), await this.catalogs.of(p.getId()))),
    );
  }

  public async save(
    projectId: string,
    userId: EntityId,
    request: OperationsRequest,
  ): Promise<Result<OperationsResponse>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<OperationsResponse>> => {
        const catalog: FieldCatalog = await this.catalogs.of(p.getId());
        const pipeline: OperationPipeline = await this.of(p.getId());
        const collections: SupplementaryCollection[] = await this.collections.findByProject(p.getId());
        const result: Result<OperationPipeline> = pipeline.replace(
          request.steps,
          catalog,
          CatalogResolver.of(catalog),
          (id: string): Nullable<SupplementaryCollection> =>
            collections.find((c: SupplementaryCollection): boolean => c.getId().toString() === id) ?? null,
          this.clock,
        );
        if (result.isOk()) {
          await this.pipelines.save(result.unwrap());
        }
        return result.map((saved: OperationPipeline): OperationsResponse => this.present(saved, catalog));
      },
    );
  }

  /** Ejecutor listo para aplicar a los registros de `query` (con la historia de sus acumulados). */
  public async runner(
    projectId: EntityId,
    query: RecordQuery,
    periods: Iterable<string>,
  ): Promise<OperationRunner> {
    const catalog: FieldCatalog = await this.catalogs.of(projectId);
    const runner: OperationRunner = new OperationRunner(
      (await this.of(projectId)).getSteps(),
      catalog,
      CatalogResolver.of(catalog),
      new CollectionRates(await this.collections.findByProject(projectId)),
    );
    await runner.prepare(periods, new RepositoryHistory(this.records, query));
    return runner;
  }

  /** Moneda fija de los encabezados que escribe una conversión (para no mezclar monedas). */
  public async convertedCurrencies(projectId: EntityId): Promise<ReadonlyMap<string, string>> {
    return (await this.of(projectId)).convertedCurrencies();
  }

  private async of(projectId: EntityId): Promise<OperationPipeline> {
    return (await this.pipelines.findByProject(projectId)).orElseGet((): OperationPipeline =>
      OperationPipeline.empty(projectId, this.clock),
    );
  }

  private present(pipeline: OperationPipeline, catalog: FieldCatalog): OperationsResponse {
    const resolver: ListFieldResolver = CatalogResolver.of(catalog);
    const formatter: FormulaFormatter = new FormulaFormatter();
    return {
      version: pipeline.getVersion(),
      steps: pipeline
        .getSteps()
        .map((s: OperationStepDto): OperationStepDto =>
          s.kind === OperationKind.CALCULATED && s.formula !== null
            ? { ...s, formula: formatter.format(s.formula, resolver) }
            : s,
        ),
    };
  }
}
