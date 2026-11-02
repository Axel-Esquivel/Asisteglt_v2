import { AnalysisErrorCode, PeriodGrouping, PeriodValue } from '@asisteglt/shared-contracts';
import { Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';

/** Mes de calendario (`AAAA-MM`) como número de meses desde el año 0, para sumar y restar. */
class MonthIndex {
  private constructor(private readonly value: number) {}

  public static parse(period: string): Nullable<MonthIndex> {
    const match: Nullable<RegExpExecArray> = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
    if (match === null) {
      return null;
    }
    return new MonthIndex(Number(match[1] ?? '0') * 12 + Number(match[2] ?? '1') - 1);
  }

  public static of(value: number): MonthIndex {
    return new MonthIndex(value);
  }

  public get index(): number {
    return this.value;
  }

  public year(): number {
    return Math.floor(this.value / 12);
  }

  /** Mes del año, 1 a 12. */
  public month(): number {
    return (this.value % 12) + 1;
  }

  public plus(months: number): MonthIndex {
    return new MonthIndex(this.value + months);
  }

  public toString(): string {
    return `${String(this.year()).padStart(4, '0')}-${String(this.month()).padStart(2, '0')}`;
  }

  public toDisplay(): string {
    return `${String(this.month()).padStart(2, '0')}/${String(this.year())}`;
  }
}

/**
 * Meses que cubre una columna de una tabla de datos: el bloque de calendario (mes, bimestre,
 * trimestre, semestre o año) que contiene el período del informe, hasta ese mes; o el bloque
 * anterior completo (en enero, el mes anterior es diciembre del año anterior).
 */
export class PeriodWindow {
  private constructor(
    private readonly start: MonthIndex,
    private readonly end: MonthIndex,
  ) {}

  public static of(period: string, grouping: PeriodGrouping, offset: number): Result<PeriodWindow> {
    const month: Nullable<MonthIndex> = MonthIndex.parse(period);
    if (month === null) {
      return Result.fail(
        new ValidationError(AnalysisErrorCode.INVALID_REPORT, 'El período debe tener el formato AAAA-MM'),
      );
    }
    if (!Number.isInteger(offset) || offset > 0 || offset < -12) {
      return Result.fail(
        new ValidationError(AnalysisErrorCode.INVALID_REPORT, 'El desplazamiento del período no es válido'),
      );
    }
    const size: number = PeriodWindow.size(grouping);
    const blockStart: MonthIndex = MonthIndex.of(month.index - ((month.month() - 1) % size));
    if (offset === 0) {
      return Result.ok(new PeriodWindow(blockStart, month));
    }
    const start: MonthIndex = blockStart.plus(offset * size);
    return Result.ok(new PeriodWindow(start, start.plus(size - 1)));
  }

  public static size(grouping: PeriodGrouping): number {
    switch (grouping) {
      case PeriodGrouping.MONTH:
        return 1;
      case PeriodGrouping.BIMESTER:
        return 2;
      case PeriodGrouping.QUARTER:
        return 3;
      case PeriodGrouping.SEMESTER:
        return 6;
      case PeriodGrouping.YEAR:
        return 12;
    }
  }

  public first(): string {
    return this.start.toString();
  }

  public last(): string {
    return this.end.toString();
  }

  /** Meses del período, en orden. */
  public months(): string[] {
    const months: string[] = [];
    for (let i: number = this.start.index; i <= this.end.index; i += 1) {
      months.push(MonthIndex.of(i).toString());
    }
    return months;
  }

  /** ¿Un registro de ese mes entra en la columna, según cómo toma los datos? */
  public selects(period: string, value: PeriodValue): boolean {
    switch (value) {
      case PeriodValue.CLOSING:
        return period === this.end.toString();
      case PeriodValue.OPENING:
        return period === this.start.toString();
      case PeriodValue.ACCUMULATED:
        return period >= this.start.toString() && period <= this.end.toString();
    }
  }

  public label(): string {
    return this.start.index === this.end.index
      ? this.end.toDisplay()
      : `${this.start.toDisplay()} – ${this.end.toDisplay()}`;
  }
}
