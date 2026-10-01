import { AnalysisErrorCode, DataType, ReportDefinitionRequest, RowSource } from '@asisteglt/shared-contracts';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
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
    if (r.measures.length === 0 || r.measures.length > 20) {
      return fail(AnalysisErrorCode.INVALID_REPORT, 'Elige entre 1 y 20 medidas');
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
    });
  }
}
