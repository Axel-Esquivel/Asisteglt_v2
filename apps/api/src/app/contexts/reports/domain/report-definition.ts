import {
  Aggregation,
  AnalysisErrorCode,
  DataColumnDto,
  DataColumnKind,
  DataType,
  PeriodValue,
  ReportDefinitionRequest,
  RowSource,
} from '@asisteglt/shared-contracts';
import {
  CompiledFormula,
  FormulaCompiler,
  FormulaContext,
  ListFieldResolver,
} from '@asisteglt/shared-formula-engine';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CatalogResolver } from './catalog-resolver';
import { ColumnSplit } from './data-scope';
import { CatalogField, FieldCatalog } from './field-catalog';

export interface ReportDefinitionSnapshot extends ReportDefinitionRequest {
  readonly id: string;
  readonly projectId: string;
  readonly updatedAt: Date;
}

/**
 * Tabla de datos guardada (antes «informe»): origen, alcance, período, filas (clasificación o
 * encabezado agrupable) y columnas ordenadas, opcionalmente abiertas por la estructura.
 */
export class ReportDefinition extends AggregateRoot {
  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private spec: ReportDefinitionRequest,
    private updatedAt: Date,
  ) {
    super(id);
  }

  public static create(
    projectId: EntityId,
    request: ReportDefinitionRequest,
    catalog: FieldCatalog,
    clock: Clock,
  ): Result<ReportDefinition> {
    return ReportDefinition.validate(request, catalog).map(
      (valid: ReportDefinitionRequest): ReportDefinition =>
        new ReportDefinition(EntityId.generate(), projectId, valid, clock.now()),
    );
  }

  public static restore(s: ReportDefinitionSnapshot): ReportDefinition {
    const { id, projectId, updatedAt, ...spec } = s;
    return new ReportDefinition(
      EntityId.fromString(id).unwrap(),
      EntityId.fromString(projectId).unwrap(),
      spec,
      updatedAt,
    );
  }

  public getSpec(): ReportDefinitionRequest {
    return this.spec;
  }

  public belongsTo(projectId: EntityId): boolean {
    return this.projectId.equals(projectId);
  }

  public update(
    request: ReportDefinitionRequest,
    catalog: FieldCatalog,
    clock: Clock,
  ): Result<ReportDefinition> {
    return ReportDefinition.validate(request, catalog).map(
      (valid: ReportDefinitionRequest): ReportDefinition => {
        this.spec = valid;
        this.updatedAt = clock.now();
        return this;
      },
    );
  }

  public toSnapshot(): ReportDefinitionSnapshot {
    return {
      ...this.spec,
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      updatedAt: this.updatedAt,
    };
  }

  /** Cómo se propone tomar un encabezado al agrupar meses: los saldos (último valor), al cierre. */
  public static suggestedPeriodValue(field: CatalogField): PeriodValue {
    return field.snapshot().aggregation === Aggregation.LAST ? PeriodValue.CLOSING : PeriodValue.ACCUMULATED;
  }

  /** La compatibilidad se valida con rol, tipo y naturaleza (docs/12 §2.6). */
  private static validate(
    r: ReportDefinitionRequest,
    catalog: FieldCatalog,
  ): Result<ReportDefinitionRequest> {
    const fail = (code: AnalysisErrorCode, message: string): Result<ReportDefinitionRequest> =>
      Result.fail(new ValidationError(code, message));
    const name: string = r.name.trim();
    if (name.length < 2 || name.length > 80) {
      return fail(AnalysisErrorCode.INVALID_REPORT, 'El nombre debe tener entre 2 y 80 caracteres');
    }
    const measures: number = r.columns.filter(
      (c: DataColumnDto): boolean => c.kind === DataColumnKind.MEASURE,
    ).length;
    const formulas: number = r.columns.length - measures;
    if (r.columns.length === 0 || measures > 30) {
      return fail(
        AnalysisErrorCode.INVALID_REPORT,
        'Agrega entre 1 y 30 columnas de datos o columnas calculadas',
      );
    }
    if (formulas > 10) {
      return fail(AnalysisErrorCode.INVALID_REPORT, 'Una tabla admite hasta 10 columnas calculadas');
    }
    if (r.classificationColumns.length > 10) {
      return fail(AnalysisErrorCode.INVALID_REPORT, 'Una tabla admite hasta 10 columnas de clasificación');
    }
    const resolver: ListFieldResolver = CatalogResolver.of(catalog);
    const columns: DataColumnDto[] = [];
    for (const column of r.columns) {
      const label: string = column.label.trim();
      if (label.length > 80) {
        return fail(AnalysisErrorCode.INVALID_REPORT, 'Los títulos de columna admiten hasta 80 caracteres');
      }
      if (!Number.isInteger(column.periodOffset) || column.periodOffset > 0 || column.periodOffset < -1) {
        return fail(
          AnalysisErrorCode.INVALID_REPORT,
          'Una columna solo puede usar el período del informe o el anterior',
        );
      }
      if (column.kind === DataColumnKind.FORMULA) {
        if (label.length < 1) {
          return fail(AnalysisErrorCode.INVALID_REPORT, 'Cada columna calculada necesita un título');
        }
        const compiled: Result<CompiledFormula> = new FormulaCompiler().compile(
          column.formula ?? '',
          resolver,
          FormulaContext.AGGREGATE,
        );
        const error = compiled.errorOrNull();
        if (error !== null) {
          return fail(AnalysisErrorCode.INVALID_REPORT, `Columna «${label}»: ${error.message}`);
        }
        columns.push({
          ...column,
          label,
          fieldKey: null,
          formula: compiled.unwrap().canonicalSource,
        });
        continue;
      }
      const key: string = column.fieldKey ?? '';
      const field: Nullable<CatalogField> = catalog.find(key).toNullable();
      if (field === null || !field.isActive() || !field.isAggregatable()) {
        return fail(
          AnalysisErrorCode.FIELD_NOT_AGGREGATABLE,
          `«${field === null ? key : field.label}» no se puede sumar ni promediar`,
        );
      }
      columns.push({ ...column, label, fieldKey: key, formula: null });
    }
    if (r.rowSource === RowSource.CLASSIFICATION && r.classificationId === null) {
      return fail(AnalysisErrorCode.INVALID_REPORT, 'Elige la clasificación de las filas');
    }
    if (r.rowSource === RowSource.FIELD) {
      const row: Nullable<CatalogField> =
        r.rowFieldKey === null ? null : catalog.find(r.rowFieldKey).toNullable();
      if (row === null || !row.isActive() || !row.isGroupable()) {
        return fail(
          AnalysisErrorCode.FIELD_NOT_GROUPABLE,
          'Las filas deben agruparse por texto, número descriptivo, fecha o sí/no',
        );
      }
    }
    if (r.onlyWhenFieldKey !== null) {
      const flag: Nullable<CatalogField> = catalog.find(r.onlyWhenFieldKey).toNullable();
      if (flag === null || flag.snapshot().dataType !== DataType.BOOLEAN) {
        return fail(AnalysisErrorCode.INVALID_REPORT, 'El filtro «solo cuando» debe ser un encabezado sí/no');
      }
    }
    const unique = (list: ReadonlyArray<string>): string[] => [...new Set(list)];
    return Result.ok({
      ...r,
      name,
      classificationId: r.rowSource === RowSource.CLASSIFICATION ? r.classificationId : null,
      rowFieldKey: r.rowSource === RowSource.FIELD ? r.rowFieldKey : null,
      classificationColumns: unique(r.classificationColumns),
      columns,
      columnSplit: ColumnSplit.normalize(r.columnSplit),
      scope: {
        organizationIds: unique(r.scope.organizationIds),
        countryIds: unique(r.scope.countryIds),
        currencies: unique(r.scope.currencies),
        companyIds: unique(r.scope.companyIds),
        enterpriseIds: unique(r.scope.enterpriseIds),
        branchIds: unique(r.scope.branchIds),
      },
    });
  }
}
