import {
  AnalysisErrorCode,
  DataType,
  FormulaColumnDto,
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
import { CatalogField, FieldCatalog } from './field-catalog';

export interface ReportDefinitionSnapshot extends ReportDefinitionRequest {
  readonly id: string;
  readonly projectId: string;
  readonly updatedAt: Date;
}

/** Informe matricial guardado: filas (clasificación o encabezado agrupable) × medidas. */
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
      { ...spec, formulaColumns: Array.isArray(spec.formulaColumns) ? spec.formulaColumns : [] },
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
    if (r.measures.length + r.formulaColumns.length === 0 || r.measures.length > 20) {
      return fail(
        AnalysisErrorCode.INVALID_REPORT,
        'Elige entre 1 y 20 medidas o agrega una columna calculada',
      );
    }
    if (r.formulaColumns.length > 10) {
      return fail(AnalysisErrorCode.INVALID_REPORT, 'Un informe admite hasta 10 columnas calculadas');
    }
    const resolver: ListFieldResolver = CatalogResolver.of(catalog);
    const formulaColumns: FormulaColumnDto[] = [];
    for (const column of r.formulaColumns) {
      const label: string = column.label.trim();
      if (label.length < 1 || label.length > 80) {
        return fail(
          AnalysisErrorCode.INVALID_REPORT,
          'Cada columna calculada necesita un título de hasta 80 caracteres',
        );
      }
      const compiled: Result<CompiledFormula> = new FormulaCompiler().compile(
        column.formula,
        resolver,
        FormulaContext.AGGREGATE,
      );
      const error = compiled.errorOrNull();
      if (error !== null) {
        return fail(AnalysisErrorCode.INVALID_REPORT, `Columna «${label}»: ${error.message}`);
      }
      formulaColumns.push({ label, formula: compiled.unwrap().canonicalSource });
    }
    for (const key of r.measures) {
      const field: Nullable<CatalogField> = catalog.find(key).toNullable();
      if (field === null || !field.isActive() || !field.isAggregatable()) {
        return fail(
          AnalysisErrorCode.FIELD_NOT_AGGREGATABLE,
          `«${field === null ? key : field.label}» no se puede sumar ni promediar`,
        );
      }
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
    return Result.ok({
      ...r,
      name,
      classificationId: r.rowSource === RowSource.CLASSIFICATION ? r.classificationId : null,
      rowFieldKey: r.rowSource === RowSource.FIELD ? r.rowFieldKey : null,
      measures: [...new Set(r.measures)],
      formulaColumns,
    });
  }
}
