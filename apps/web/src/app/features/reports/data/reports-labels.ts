import {
  Aggregation,
  DataType,
  FieldOrigin,
  FieldRole,
  ImportItemStatus,
  NumericNature,
  OrgLevel,
  ProfileStatus,
} from '@asisteglt/shared-contracts';

export interface Option<T> {
  readonly label: string;
  readonly value: T;
}

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** Textos de interfaz del módulo de Reportes (los valores internos nunca se muestran). */
export class ReportsLabels {
  public static readonly ROLES: Option<FieldRole>[] = [
    { label: 'Identificador (id)', value: FieldRole.IDENTIFIER },
    { label: 'Nombre del identificador (id_name)', value: FieldRole.IDENTIFIER_NAME },
    { label: 'Dato (data)', value: FieldRole.DATA },
  ];

  public static readonly TYPES: Option<DataType>[] = [
    { label: 'Texto', value: DataType.TEXT },
    { label: 'Número entero', value: DataType.INTEGER },
    { label: 'Número decimal', value: DataType.DECIMAL },
    { label: 'Fecha', value: DataType.DATE },
    { label: 'Sí / No', value: DataType.BOOLEAN },
  ];

  public static readonly NATURES: Option<NumericNature>[] = [
    { label: 'Monto', value: NumericNature.AMOUNT },
    { label: 'Cantidad', value: NumericNature.QUANTITY },
    { label: 'Tasa / porcentaje', value: NumericNature.RATE },
    { label: 'Precio unitario', value: NumericNature.UNIT_PRICE },
    { label: 'Número descriptivo', value: NumericNature.DESCRIPTIVE },
  ];

  public static readonly AGGREGATIONS: Option<Aggregation>[] = [
    { label: 'Suma', value: Aggregation.SUM },
    { label: 'Promedio', value: Aggregation.AVERAGE },
    { label: 'Promedio ponderado', value: Aggregation.WEIGHTED_AVERAGE },
    { label: 'Mínimo', value: Aggregation.MIN },
    { label: 'Máximo', value: Aggregation.MAX },
    { label: 'Último', value: Aggregation.LAST },
    { label: 'Contar', value: Aggregation.COUNT },
    { label: 'No agregable', value: Aggregation.NONE },
  ];

  public static readonly ORIGINS: Option<FieldOrigin>[] = [
    { label: 'Importado', value: FieldOrigin.IMPORTED },
    { label: 'Derivado', value: FieldOrigin.DERIVED },
  ];

  public static readonly LEVELS: Option<OrgLevel>[] = [
    { label: 'Organización', value: OrgLevel.ORGANIZATION },
    { label: 'País', value: OrgLevel.COUNTRY },
    { label: 'Compañía', value: OrgLevel.COMPANY },
    { label: 'Empresa', value: OrgLevel.ENTERPRISE },
    { label: 'Sucursal', value: OrgLevel.BRANCH },
  ];

  public static label<T>(options: Option<T>[], value: T): string {
    const match: Option<T> | null = options.find((o: Option<T>): boolean => o.value === value) ?? null;
    return match === null ? String(value) : match.label;
  }

  public static profileStatus(status: ProfileStatus): {
    readonly label: string;
    readonly severity: Severity;
  } {
    switch (status) {
      case ProfileStatus.DRAFT:
        return { label: 'Borrador', severity: 'secondary' };
      case ProfileStatus.ACTIVE:
        return { label: 'Activa', severity: 'success' };
      case ProfileStatus.ARCHIVED:
        return { label: 'Archivada', severity: 'contrast' };
    }
  }

  public static importStatus(status: ImportItemStatus): {
    readonly label: string;
    readonly severity: Severity;
  } {
    switch (status) {
      case ImportItemStatus.QUEUED:
        return { label: 'En cola', severity: 'secondary' };
      case ImportItemStatus.PROCESSING:
        return { label: 'Procesando', severity: 'info' };
      case ImportItemStatus.PUBLISHED:
        return { label: 'Publicado', severity: 'success' };
      case ImportItemStatus.FAILED:
        return { label: 'Con errores', severity: 'danger' };
      case ImportItemStatus.SUPERSEDED:
        return { label: 'Reemplazado', severity: 'contrast' };
    }
  }

  public static childLevel(level: OrgLevel): OrgLevel | null {
    const order: OrgLevel[] = [
      OrgLevel.ORGANIZATION,
      OrgLevel.COUNTRY,
      OrgLevel.COMPANY,
      OrgLevel.ENTERPRISE,
      OrgLevel.BRANCH,
    ];
    return order[order.indexOf(level) + 1] ?? null;
  }
}
