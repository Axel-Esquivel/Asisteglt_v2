import {
  ClassificationNodeDto,
  DataScopeDto,
  PeriodGrouping,
  PeriodValue,
  ValueFilterDto,
} from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Classification } from './classification';
import { DataScope } from './data-scope';
import { PeriodWindow } from './period-window';
import { DataRecordSnapshot } from './ports';

/**
 * Qué registros entran en un valor filtrado o una tabla dinámica: el alcance (organización, país,
 * moneda, compañía…), los nodos elegidos de una clasificación (con sus descendientes) y los meses
 * del período según cómo se toman (cierre, apertura o acumulado).
 */
export class RecordFilter {
  private constructor(
    private readonly scope: DataScope,
    private readonly classification: Nullable<Classification>,
    private readonly nodes: ReadonlySet<string>,
    /** Ventana de cada desplazamiento pedido (0 = período del informe, -1 = el anterior). */
    private readonly windows: ReadonlyMap<number, PeriodWindow>,
    private readonly periodValue: PeriodValue,
    private readonly offset: number,
  ) {}

  public static everything(): DataScopeDto {
    return DataScope.all();
  }

  /** Filtro sin restricciones del mes del informe (los indicadores anteriores a los filtros). */
  public static plain(scope: DataScopeDto): ValueFilterDto {
    return {
      classificationId: null,
      nodeIds: [],
      scope,
      periodGrouping: PeriodGrouping.MONTH,
      periodValue: PeriodValue.ACCUMULATED,
      periodOffset: 0,
      presentation: null,
    };
  }

  /**
   * `scope` es el alcance efectivo (el del filtro o el que eligió quien genera el informe);
   * `classification` es la del filtro, ya cargada (`null` si no filtra por clasificación);
   * `offsets` son los períodos adicionales que se leen (p. ej. -1 para el período anterior).
   */
  public static of(
    dto: ValueFilterDto,
    scope: DataScopeDto,
    classification: Nullable<Classification>,
    period: string,
    offsets: ReadonlyArray<number>,
  ): Result<RecordFilter> {
    const windows: Map<number, PeriodWindow> = new Map<number, PeriodWindow>();
    for (const offset of new Set<number>([dto.periodOffset, ...offsets])) {
      const window: Result<PeriodWindow> = PeriodWindow.of(period, dto.periodGrouping, offset);
      const error = window.errorOrNull();
      if (error !== null) {
        return Result.fail(error);
      }
      windows.set(offset, window.unwrap());
    }
    return Result.ok(
      new RecordFilter(
        DataScope.of(scope),
        classification,
        classification === null ? new Set<string>() : RecordFilter.withDescendants(classification, dto.nodeIds),
        windows,
        dto.periodValue,
        dto.periodOffset,
      ),
    );
  }

  /** Los nodos elegidos y todos los que cuelgan de ellos. */
  public static withDescendants(classification: Classification, nodeIds: ReadonlyArray<string>): Set<string> {
    const chosen: Set<string> = new Set<string>(nodeIds);
    const nodes: ReadonlyArray<ClassificationNodeDto> = classification.getNodes();
    let grew: boolean = true;
    while (grew) {
      grew = false;
      for (const node of nodes) {
        if (!chosen.has(node.id) && node.parentId !== null && chosen.has(node.parentId)) {
          chosen.add(node.id);
          grew = true;
        }
      }
    }
    return chosen;
  }

  /** ¿Entra el registro en el período del filtro y en sus unidades y nodos? */
  public matches(record: DataRecordSnapshot): boolean {
    return this.selects(record.period, this.offset) && this.admits(record);
  }

  /** ¿Pertenece el registro al alcance y a los nodos elegidos (sin mirar el período)? */
  public admits(record: DataRecordSnapshot): boolean {
    if (!this.scope.matches(record)) {
      return false;
    }
    if (this.classification === null || this.nodes.size === 0) {
      return true;
    }
    const value: CellValue = record.values[this.classification.getFieldKey()] ?? null;
    const node: Nullable<string> = typeof value === 'string' ? this.classification.classify(value) : null;
    return node !== null && this.nodes.has(node);
  }

  /** ¿Un registro de ese mes entra en el período con ese desplazamiento? */
  public selects(period: string, offset: number): boolean {
    const window: Nullable<PeriodWindow> = this.windows.get(offset) ?? null;
    return window !== null && window.selects(period, this.periodValue);
  }

  /** Meses que hay que leer, en orden. */
  public months(): string[] {
    const months: Set<string> = new Set<string>();
    for (const window of this.windows.values()) {
      for (const month of window.months()) {
        months.add(month);
      }
    }
    return [...months].sort();
  }

  public label(): string {
    const window: Nullable<PeriodWindow> = this.windows.get(this.offset) ?? null;
    return window === null ? '' : window.label();
  }

  public singleCompany(): Nullable<string> {
    return this.scope.singleCompany();
  }
}
