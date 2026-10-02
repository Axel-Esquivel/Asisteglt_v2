import { Injectable } from '@nestjs/common';
import {
  AnalysisErrorCode,
  ClassificationRequest,
  ComputedReportResponse,
  FormulaColumnDto,
  NumericNature,
  ProjectPermission,
  ReportDefinitionRequest,
  ReportDefinitionResponse,
  RowSource,
} from '@asisteglt/shared-contracts';
import {
  Clock,
  Decimal,
  EntityId,
  NotFoundError,
  Nullable,
  Result,
  ValidationError,
} from '@asisteglt/shared-kernel';
import { ProjectAccess } from '../../projects/application/project-access';
import { Project } from '../../projects/domain/project';
import {
  AggregateRequest,
  AggregateRequestCollector,
  Evaluator,
  Expression,
  FormulaFormatter,
  FormulaValue,
  Lexer,
  ListFieldResolver,
  Parser,
  Token,
} from '@asisteglt/shared-formula-engine';
import { RecordAggregates } from '../domain/record-aggregates';
import { CatalogResolver } from '../domain/catalog-resolver';
import { Classification } from '../domain/classification';
import { FieldCatalog } from '../domain/field-catalog';
import {
  ClassificationRepository,
  DataRecordRepository,
  RecordQuery,
  ReportDefinitionRepository,
  ReportTemplateRepository,
} from '../domain/ports';
import { ReportTemplate } from '../domain/report-template';
import { ReportDefinition } from '../domain/report-definition';
import { ReportEngine } from '../domain/report-engine';
import { CatalogService } from './catalog.service';
import { OperationsService } from './operations.service';
import { OperationRunner } from '../domain/operation-runner';

/** Clasificaciones e informes matriciales calculados sobre los datos publicados. */
@Injectable()
export class AnalysisService {
  public constructor(
    private readonly classifications: ClassificationRepository,
    private readonly definitions: ReportDefinitionRepository,
    private readonly records: DataRecordRepository,
    private readonly templates: ReportTemplateRepository,
    private readonly catalogs: CatalogService,
    private readonly operations: OperationsService,
    private readonly access: ProjectAccess,
    private readonly clock: Clock,
  ) {}

  public async listClassifications(projectId: string, userId: EntityId): Promise<Result<Classification[]>> {
    return (await this.access.load(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<Classification[]>> =>
        Result.ok(await this.classifications.findByProject(p.getId())),
    );
  }

  public async saveClassification(
    projectId: string,
    userId: EntityId,
    classificationId: Nullable<string>,
    request: ClassificationRequest,
  ): Promise<Result<Classification>> {
    return (await this.access.require(projectId, userId, ProjectPermission.DATA_CONFIGURE)).flatMapAsync(
      async (p: Project): Promise<Result<Classification>> => {
        const catalog: FieldCatalog = await this.catalogs.of(p.getId());
        const result: Result<Classification> =
          classificationId === null
            ? Classification.create(p.getId(), request, catalog, this.clock)
            : (await this.classification(p, classificationId)).flatMap(
                (c: Classification): Result<Classification> => c.update(request, catalog, this.clock),
              );
        if (result.isOk()) {
          await this.classifications.save(result.unwrap());
        }
        return result;
      },
    );
  }

  public async deleteClassification(
    projectId: string,
    userId: EntityId,
    classificationId: string,
  ): Promise<Result<true>> {
    return (await this.access.require(projectId, userId, ProjectPermission.DATA_CONFIGURE)).flatMapAsync(
      async (p: Project): Promise<Result<true>> =>
        (await this.classification(p, classificationId)).flatMapAsync(
          async (c: Classification): Promise<Result<true>> => {
            const used: boolean = (await this.definitions.findByProject(p.getId())).some(
              (d: ReportDefinition): boolean => d.getSpec().classificationId === c.getId().toString(),
            );
            if (used) {
              return Result.fail(
                new ValidationError(
                  AnalysisErrorCode.INVALID_CLASSIFICATION,
                  'La clasificación se usa en un informe',
                ),
              );
            }
            await this.classifications.delete(c.getId());
            return Result.ok(true);
          },
        ),
    );
  }

  public async listReports(projectId: string, userId: EntityId): Promise<Result<ReportDefinition[]>> {
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_VIEW)).flatMapAsync(
      async (p: Project): Promise<Result<ReportDefinition[]>> =>
        Result.ok(await this.definitions.findByProject(p.getId())),
    );
  }

  public async saveReport(
    projectId: string,
    userId: EntityId,
    reportId: Nullable<string>,
    request: ReportDefinitionRequest,
  ): Promise<Result<ReportDefinition>> {
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_DESIGN)).flatMapAsync(
      async (p: Project): Promise<Result<ReportDefinition>> => {
        if (request.rowSource === RowSource.CLASSIFICATION && request.classificationId !== null) {
          const exists: Result<Classification> = await this.classification(p, request.classificationId);
          if (!exists.isOk()) {
            return Result.fail(exists.errorOrNull() ?? AnalysisService.reportNotFound());
          }
        }
        const catalog: FieldCatalog = await this.catalogs.of(p.getId());
        const result: Result<ReportDefinition> =
          reportId === null
            ? ReportDefinition.create(p.getId(), request, catalog, this.clock)
            : (await this.report(p, reportId)).flatMap((d: ReportDefinition): Result<ReportDefinition> =>
                d.update(request, catalog, this.clock),
              );
        if (result.isOk()) {
          await this.definitions.save(result.unwrap());
        }
        return result;
      },
    );
  }

  public async deleteReport(projectId: string, userId: EntityId, reportId: string): Promise<Result<true>> {
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_DESIGN)).flatMapAsync(
      async (p: Project): Promise<Result<true>> =>
        (await this.report(p, reportId)).flatMapAsync(async (d: ReportDefinition): Promise<Result<true>> => {
          const used: boolean = (await this.templates.findByProject(p.getId())).some(
            (t: ReportTemplate): boolean => t.usesReport(d.getId().toString()),
          );
          if (used) {
            return Result.fail(
              new ValidationError(AnalysisErrorCode.INVALID_REPORT, 'El informe se usa en una plantilla'),
            );
          }
          await this.definitions.delete(d.getId());
          return Result.ok(true);
        }),
    );
  }

  /** Calcula el informe de un período recorriendo los registros publicados en flujo. */
  public async run(
    projectId: string,
    userId: EntityId,
    reportId: string,
    period: string,
  ): Promise<Result<ComputedReportResponse>> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return Result.fail(
        new ValidationError(AnalysisErrorCode.INVALID_REPORT, 'El período debe tener el formato AAAA-MM'),
      );
    }
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_VIEW)).flatMapAsync(
      (p: Project): Promise<Result<ComputedReportResponse>> => this.compute(p, reportId, period),
    );
  }

  /** Calcula un informe del proyecto (sin revisar permisos: lo hace quien llama). */
  public async compute(
    p: Project,
    reportId: string,
    period: string,
  ): Promise<Result<ComputedReportResponse>> {
    return (await this.report(p, reportId)).flatMapAsync(
      async (definition: ReportDefinition): Promise<Result<ComputedReportResponse>> => {
        const spec: ReportDefinitionRequest = definition.getSpec();
        const classification: Nullable<Classification> =
          spec.classificationId === null
            ? null
            : (await this.classification(p, spec.classificationId)).match(
                (c: Classification): Nullable<Classification> => c,
                (): Nullable<Classification> => null,
              );
        const engine: ReportEngine = new ReportEngine(
          definition,
          await this.catalogs.of(p.getId()),
          classification,
          await this.operations.convertedCurrencies(p.getId()),
        );
        const query: RecordQuery = new RecordQuery(
          p.getId().toString(),
          period,
          spec.profileId,
          spec.companyId,
          [],
          null,
        );
        const runner: OperationRunner = await this.operations.runner(p.getId(), query, [period]);
        for await (const record of this.records.stream(query)) {
          engine.add(runner.apply(record));
        }
        return Result.ok(engine.result(definition.getId().toString(), period));
      },
    );
  }

  /**
   * Evalúa una fórmula agregada (forma canónica) sobre los registros del período, con las
   * operaciones aplicadas. Falla si suma montos de monedas distintas.
   */
  public async kpi(
    p: Project,
    formula: string,
    period: string,
    profileId: Nullable<string>,
    companyId: Nullable<string>,
  ): Promise<Result<Nullable<string>>> {
    const catalog: FieldCatalog = await this.catalogs.of(p.getId());
    const resolver: ListFieldResolver = CatalogResolver.of(catalog);
    const root: Nullable<Expression> = new Lexer()
      .tokenize(formula)
      .flatMap((tokens: Token[]): Result<Expression> => new Parser(resolver).parse(tokens))
      .match(
        (e: Expression): Nullable<Expression> => e,
        (): Nullable<Expression> => null,
      );
    if (root === null) {
      return Result.fail(new ValidationError(AnalysisErrorCode.INVALID_REPORT, 'La fórmula ya no es válida'));
    }
    const requests: AggregateRequest[] = new AggregateRequestCollector(resolver).collect(root);
    const sensitive: string[] = requests
      .map((r: AggregateRequest): string => r.key)
      .filter((key: string): boolean => {
        const field = resolver.find(key);
        return (
          field !== null &&
          (field.nature === NumericNature.AMOUNT || field.nature === NumericNature.UNIT_PRICE)
        );
      });
    const converted: ReadonlyMap<string, string> = await this.operations.convertedCurrencies(p.getId());
    const aggregates: RecordAggregates = new RecordAggregates(requests);
    const currencies: Set<string> = new Set<string>();
    const query: RecordQuery = new RecordQuery(p.getId().toString(), period, profileId, companyId, [], null);
    const runner: OperationRunner = await this.operations.runner(p.getId(), query, [period]);
    for await (const raw of this.records.stream(query)) {
      const record = runner.apply(raw);
      aggregates.add(record.values);
      for (const key of sensitive) {
        if (typeof record.values[key] === 'string') {
          currencies.add(converted.get(key) ?? record.currency);
        }
      }
    }
    if (currencies.size > 1) {
      return Result.fail(
        new ValidationError(
          AnalysisErrorCode.INVALID_REPORT,
          `Suma montos en varias monedas (${[...currencies].sort().join(', ')}); usa un encabezado convertido o filtra por compañía`,
        ),
      );
    }
    const value: FormulaValue = new Evaluator(resolver, aggregates).evaluate(root);
    return Result.ok(value instanceof Decimal ? value.toString() : null);
  }

  /** Respuesta con las fórmulas de las columnas calculadas escritas con los nombres vigentes. */
  public async present(definition: ReportDefinition): Promise<ReportDefinitionResponse> {
    const snapshot = definition.toSnapshot();
    const catalog: FieldCatalog = await this.catalogs.of(EntityId.fromString(snapshot.projectId).unwrap());
    const resolver: ListFieldResolver = CatalogResolver.of(catalog);
    const formatter: FormulaFormatter = new FormulaFormatter();
    const spec: ReportDefinitionRequest = definition.getSpec();
    return {
      ...spec,
      id: snapshot.id,
      formulaColumns: spec.formulaColumns.map((c: FormulaColumnDto): FormulaColumnDto => ({
        label: c.label,
        formula: formatter.format(c.formula, resolver),
      })),
      updatedAt: snapshot.updatedAt.toISOString(),
    };
  }

  private async classification(project: Project, id: string): Promise<Result<Classification>> {
    const parsed: Result<EntityId> = EntityId.fromString(id);
    const found: Nullable<Classification> = parsed.isOk()
      ? (await this.classifications.findById(parsed.unwrap()))
          .filter((c: Classification): boolean => c.belongsTo(project.getId()))
          .toNullable()
      : null;
    return found === null
      ? Result.fail(
          new NotFoundError(AnalysisErrorCode.CLASSIFICATION_NOT_FOUND, 'La clasificación no existe'),
        )
      : Result.ok(found);
  }

  private async report(project: Project, id: string): Promise<Result<ReportDefinition>> {
    const parsed: Result<EntityId> = EntityId.fromString(id);
    const found: Nullable<ReportDefinition> = parsed.isOk()
      ? (await this.definitions.findById(parsed.unwrap()))
          .filter((d: ReportDefinition): boolean => d.belongsTo(project.getId()))
          .toNullable()
      : null;
    return found === null ? Result.fail(AnalysisService.reportNotFound()) : Result.ok(found);
  }

  private static reportNotFound(): NotFoundError {
    return new NotFoundError(AnalysisErrorCode.REPORT_NOT_FOUND, 'El informe no existe');
  }
}
