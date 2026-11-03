import { Injectable } from '@nestjs/common';
import {
  AnalysisErrorCode,
  ClassificationRequest,
  ClassifiableValueResponse,
  ClassifiableValuesResponse,
  ComputedReportResponse,
  DataColumnDto,
  DataScopeDto,
  NumericNature,
  ProjectPermission,
  ReportDefinitionRequest,
  ReportDefinitionResponse,
  RowSource,
  ValueFilterDto,
} from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
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
import { CatalogField, FieldCatalog } from '../domain/field-catalog';
import {
  ClassificationRepository,
  DataRecordRepository,
  DataRecordSnapshot,
  DistinctValue,
  RecordQuery,
  ReportDefinitionRepository,
  ReportTemplateRepository,
} from '../domain/ports';
import { KpiElement, PivotElement, ReportTemplate } from '../domain/report-template';
import { PivotEngine } from '../domain/pivot-engine';
import { RecordFilter } from '../domain/record-filter';
import { ReportDefinition } from '../domain/report-definition';
import { PresentationConverter } from '../domain/presentation-currency';
import { ReportEngine, TableWindows } from '../domain/report-engine';
import { ColumnSplit, DataScope } from '../domain/data-scope';
import { OrgStructureService } from './org-structure.service';
import { CatalogService } from './catalog.service';
import { OperationsService } from './operations.service';
import { OperationRunner } from '../domain/operation-runner';

/** Clasificaciones e informes matriciales calculados sobre los datos publicados. */
@Injectable()
export class AnalysisService {
  /** Máximo de valores distintos que se devuelven para elegir cuentas. */
  public static readonly VALUES_LIMIT: number = 20_000;

  public constructor(
    private readonly classifications: ClassificationRepository,
    private readonly definitions: ReportDefinitionRepository,
    private readonly records: DataRecordRepository,
    private readonly templates: ReportTemplateRepository,
    private readonly catalogs: CatalogService,
    private readonly operations: OperationsService,
    private readonly org: OrgStructureService,
    private readonly access: ProjectAccess,
    private readonly clock: Clock,
  ) {}

  public async listClassifications(projectId: string, userId: EntityId): Promise<Result<Classification[]>> {
    return (await this.access.load(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<Classification[]>> =>
        Result.ok(await this.classifications.findByProject(p.getId())),
    );
  }

  /**
   * Valores distintos de un encabezado clasificable en todos los datos publicados (p. ej. las
   * cuentas), con su nombre, el primer y último período en que aparecen y el período más reciente.
   */
  public async classifiableValues(
    projectId: string,
    userId: EntityId,
    fieldKey: string,
  ): Promise<Result<ClassifiableValuesResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.DATA_VIEW)).flatMapAsync(
      async (p: Project): Promise<Result<ClassifiableValuesResponse>> => {
        const catalog: FieldCatalog = await this.catalogs.of(p.getId());
        const classifiable: boolean = catalog
          .find(fieldKey)
          .map((f: CatalogField): boolean => f.isActive() && f.isClassifiable())
          .orElse(false);
        if (!classifiable) {
          return Result.fail(
            new ValidationError(
              AnalysisErrorCode.FIELD_NOT_CLASSIFIABLE,
              'Solo se clasifica por un identificador o su nombre',
            ),
          );
        }
        const found: DistinctValue[] = await this.records.distinctValues(
          new RecordQuery(p.getId().toString(), null, null, null, [], null),
          fieldKey,
          catalog.nameFieldOf(fieldKey),
          AnalysisService.VALUES_LIMIT + 1,
        );
        const values: DistinctValue[] = found.slice(0, AnalysisService.VALUES_LIMIT);
        const latest: Nullable<string> = values.reduce(
          (max: Nullable<string>, v: DistinctValue): Nullable<string> =>
            max === null || v.lastPeriod > max ? v.lastPeriod : max,
          null,
        );
        return Result.ok({
          fieldKey,
          latestPeriod: latest,
          truncated: found.length > AnalysisService.VALUES_LIMIT,
          values: values.map((v: DistinctValue): ClassifiableValueResponse => ({
            value: v.value,
            name: v.name,
            firstPeriod: v.firstPeriod,
            lastPeriod: v.lastPeriod,
            records: v.records,
          })),
        });
      },
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
            const id: string = c.getId().toString();
            const used: boolean =
              (await this.definitions.findByProject(p.getId())).some(
                (d: ReportDefinition): boolean =>
                  d.getSpec().classificationId === id || d.getSpec().classificationColumns.includes(id),
              ) ||
              (await this.templates.findByProject(p.getId())).some((t: ReportTemplate): boolean =>
                t.usesClassification(id),
              );
            if (used) {
              return Result.fail(
                new ValidationError(
                  AnalysisErrorCode.INVALID_CLASSIFICATION,
                  'La clasificación se usa en una tabla de datos o en una plantilla',
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
        if (request.presentation !== null) {
          const problem: Nullable<string> = PresentationConverter.problem(
            request.presentation,
            await this.operations.collectionsOf(p.getId()),
          );
          if (problem !== null) {
            return Result.fail(new ValidationError(AnalysisErrorCode.INVALID_REPORT, problem));
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
      (p: Project): Promise<Result<ComputedReportResponse>> => this.compute(p, reportId, period, null),
    );
  }

  /**
   * Calcula una tabla de datos del proyecto (sin revisar permisos: lo hace quien llama). `scope`
   * reemplaza el alcance de la tabla (el que elige quien genera un informe); `null` usa el suyo.
   */
  public async compute(
    p: Project,
    reportId: string,
    period: string,
    scope: Nullable<DataScopeDto>,
  ): Promise<Result<ComputedReportResponse>> {
    return (await this.report(p, reportId)).flatMapAsync(
      async (saved: ReportDefinition): Promise<Result<ComputedReportResponse>> => {
        const definition: ReportDefinition = scope === null ? saved : saved.withScope(scope);
        return TableWindows.of(definition, period).flatMapAsync(
          async (windows: TableWindows): Promise<Result<ComputedReportResponse>> => {
            const spec: ReportDefinitionRequest = definition.getSpec();
            const classification: Nullable<Classification> =
              spec.classificationId === null
                ? null
                : await this.optionalClassification(p, spec.classificationId);
            const columns: Classification[] = [];
            for (const id of spec.classificationColumns) {
              const found: Nullable<Classification> = await this.optionalClassification(p, id);
              if (found !== null) {
                columns.push(found);
              }
            }
            const engine: ReportEngine = new ReportEngine(
              definition,
              await this.catalogs.of(p.getId()),
              classification,
              columns,
              new ColumnSplit(spec.columnSplit, await this.org.of(p.getId())),
              windows,
              await this.operations.convertedCurrencies(p.getId()),
              spec.presentation === null
                ? null
                : new PresentationConverter(spec.presentation, await this.operations.rates(p.getId())),
            );
            const months: string[] = windows.months();
            const query: RecordQuery = new RecordQuery(
              p.getId().toString(),
              months.at(-1) ?? period,
              spec.profileId,
              DataScope.of(spec.scope).singleCompany(),
              [],
              months[0] ?? period,
            );
            const runner: OperationRunner = await this.operations.runner(p.getId(), query, months);
            for await (const record of this.records.stream(query)) {
              engine.add(runner.apply(record));
            }
            return Result.ok(engine.result(definition.getId().toString(), period));
          },
        );
      },
    );
  }

  private async optionalClassification(p: Project, id: string): Promise<Nullable<Classification>> {
    return (await this.classification(p, id)).match(
      (c: Classification): Nullable<Classification> => c,
      (): Nullable<Classification> => null,
    );
  }

  /**
   * Valor filtrado: evalúa la fórmula agregada (forma canónica) sobre los registros que pasan sus
   * filtros (clasificación, alcance y período), con las operaciones aplicadas y, si se pidió, la
   * moneda de presentación. `chosen` es el alcance que eligió quien genera el informe y reemplaza
   * el del filtro. Falla si suma montos de monedas distintas.
   */
  public async kpi(
    p: Project,
    element: KpiElement,
    period: string,
    chosen: Nullable<DataScopeDto>,
  ): Promise<Result<Nullable<string>>> {
    const catalog: FieldCatalog = await this.catalogs.of(p.getId());
    const resolver: ListFieldResolver = CatalogResolver.of(catalog);
    const root: Nullable<Expression> = new Lexer()
      .tokenize(element.formula)
      .flatMap((tokens: Token[]): Result<Expression> => new Parser(resolver).parse(tokens))
      .match(
        (e: Expression): Nullable<Expression> => e,
        (): Nullable<Expression> => null,
      );
    if (root === null) {
      return Result.fail(new ValidationError(AnalysisErrorCode.INVALID_REPORT, 'La fórmula ya no es válida'));
    }
    const dto: ValueFilterDto = element.filter;
    const built: Result<RecordFilter> = await this.recordFilter(p, dto, chosen, period, []);
    const failure = built.errorOrNull();
    if (failure !== null) {
      return Result.fail(failure);
    }
    const filter: RecordFilter = built.unwrap();
    const requests: AggregateRequest[] = new AggregateRequestCollector(resolver).collect(root);
    const sensitive: string[] = [
      ...new Set(
        requests
          .map((r: AggregateRequest): string => r.key)
          .filter((key: string): boolean => {
            const field = resolver.find(key);
            return (
              field !== null &&
              (field.nature === NumericNature.AMOUNT || field.nature === NumericNature.UNIT_PRICE)
            );
          }),
      ),
    ];
    const converted: ReadonlyMap<string, string> = await this.operations.convertedCurrencies(p.getId());
    const presentation: Nullable<PresentationConverter> =
      dto.presentation === null
        ? null
        : new PresentationConverter(dto.presentation, await this.operations.rates(p.getId()));
    const aggregates: RecordAggregates = new RecordAggregates(requests);
    const currencies: Set<string> = new Set<string>();
    const months: string[] = filter.months();
    const query: RecordQuery = new RecordQuery(
      p.getId().toString(),
      months.at(-1) ?? period,
      element.profileId,
      filter.singleCompany(),
      [],
      months[0] ?? period,
    );
    const runner: OperationRunner = await this.operations.runner(p.getId(), query, months);
    for await (const raw of this.records.stream(query)) {
      const record: DataRecordSnapshot = runner.apply(raw);
      if (!filter.matches(record)) {
        continue;
      }
      const values: Record<string, CellValue> = { ...record.values };
      for (const key of sensitive) {
        const value: CellValue = values[key] ?? null;
        if (typeof value !== 'string') {
          continue;
        }
        const currency: string = converted.get(key) ?? record.currency;
        if (presentation === null) {
          currencies.add(currency);
          continue;
        }
        currencies.add(presentation.target());
        const amount: Nullable<Decimal> = Decimal.of(value).match(
          (d: Decimal): Nullable<Decimal> => d,
          (): Nullable<Decimal> => null,
        );
        const result: Nullable<Decimal> =
          amount === null ? null : presentation.convert(record.period, currency, amount);
        values[key] = result === null ? null : result.toString();
      }
      aggregates.add(values);
    }
    if (currencies.size > 1) {
      return Result.fail(
        new ValidationError(
          AnalysisErrorCode.INVALID_REPORT,
          `Suma montos en varias monedas (${[...currencies].sort().join(', ')}); elige una moneda de presentación o filtra por moneda o compañía`,
        ),
      );
    }
    const missing: Nullable<string> = presentation === null ? null : presentation.warning();
    if (missing !== null) {
      return Result.fail(new ValidationError(AnalysisErrorCode.INVALID_REPORT, missing));
    }
    const value: FormulaValue = new Evaluator(resolver, aggregates).evaluate(root);
    return Result.ok(value instanceof Decimal ? value.toString() : null);
  }

  /**
   * Tabla dinámica: agrupa los registros que pasan sus filtros por las dimensiones de filas y
   * columnas y agrega los valores elegidos. `chosen` reemplaza el alcance del filtro.
   */
  public async pivot(
    p: Project,
    element: PivotElement,
    period: string,
    chosen: Nullable<DataScopeDto>,
  ): Promise<Result<ComputedReportResponse>> {
    const dto: ValueFilterDto = element.filter;
    return (
      await this.recordFilter(p, dto, chosen, period, PivotEngine.offsets(element.pivot))
    ).flatMapAsync(
      async (filter: RecordFilter): Promise<Result<ComputedReportResponse>> => {
        const engine: PivotEngine = new PivotEngine(
          element.pivot,
          await this.catalogs.of(p.getId()),
          new Map<string, Classification>(
            (await this.classifications.findByProject(p.getId())).map(
              (c: Classification): [string, Classification] => [c.getId().toString(), c],
            ),
          ),
          await this.org.of(p.getId()),
          await this.operations.convertedCurrencies(p.getId()),
          dto.presentation === null
            ? null
            : new PresentationConverter(dto.presentation, await this.operations.rates(p.getId())),
        );
        const months: string[] = filter.months();
        const query: RecordQuery = new RecordQuery(
          p.getId().toString(),
          months.at(-1) ?? period,
          element.profileId,
          filter.singleCompany(),
          [],
          months[0] ?? period,
        );
        const runner: OperationRunner = await this.operations.runner(p.getId(), query, months);
        for await (const raw of this.records.stream(query)) {
          const record: DataRecordSnapshot = runner.apply(raw);
          if (filter.admits(record)) {
            engine.add(record, filter);
          }
        }
        return Result.ok(engine.result(element.id, element.name, period, filter.label()));
      },
    );
  }

  private async recordFilter(
    p: Project,
    dto: ValueFilterDto,
    chosen: Nullable<DataScopeDto>,
    period: string,
    offsets: ReadonlyArray<number>,
  ): Promise<Result<RecordFilter>> {
    const classification: Nullable<Classification> =
      dto.classificationId === null ? null : await this.optionalClassification(p, dto.classificationId);
    return RecordFilter.of(dto, chosen ?? dto.scope, classification, period, offsets);
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
      columns: spec.columns.map((c: DataColumnDto): DataColumnDto => ({
        ...c,
        formula: c.formula === null ? null : formatter.format(c.formula, resolver),
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
