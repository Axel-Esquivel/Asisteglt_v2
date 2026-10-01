import { FieldRole, OperationKind, OperationStepDto } from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import {
  Evaluator,
  Expression,
  FieldResolver,
  FormulaValue,
  Lexer,
  Parser,
  RecordContext,
  Token,
} from '@asisteglt/shared-formula-engine';
import { Decimal, Nullable, Result } from '@asisteglt/shared-kernel';
import { CatalogField, FieldCatalog } from './field-catalog';
import { DataRecordSnapshot } from './ports';

/** Tasas de cambio por período (las provee la colección elegida en el paso de conversión). */
export abstract class RateTable {
  /** `amount` (en la moneda `from`) convertido a la moneda destino del paso, o vacío si no hay tasa. */
  public abstract convert(
    step: OperationStepDto,
    period: string,
    from: string,
    amount: Decimal,
  ): Nullable<Decimal>;
}

/** Fuente de registros históricos para los acumulados (rango de períodos del mismo año). */
export abstract class HistorySource {
  public abstract between(periodFrom: string, periodTo: string): AsyncIterable<DataRecordSnapshot>;
}

/**
 * Aplica las operaciones del proyecto a cada registro, en orden. Los acumulados del año
 * (valor propio + lo del mismo grupo en los meses anteriores del año) se preparan antes con
 * `prepare`, aplicando a la historia las operaciones que no son acumulados.
 */
export class OperationRunner {
  private readonly formulas: Map<string, Expression> = new Map<string, Expression>();
  private readonly groupKeys: ReadonlyArray<string>;
  /** destino del acumulado → grupo → período → suma del origen. */
  private readonly history: Map<string, Map<string, Map<string, Decimal>>> = new Map<
    string,
    Map<string, Map<string, Decimal>>
  >();
  private readonly preparedYears: Set<string> = new Set<string>();

  public constructor(
    private readonly steps: ReadonlyArray<OperationStepDto>,
    catalog: FieldCatalog,
    private readonly resolver: FieldResolver,
    private readonly rates: RateTable,
  ) {
    this.groupKeys = catalog
      .all()
      .filter((f: CatalogField): boolean => f.snapshot().role === FieldRole.IDENTIFIER)
      .map((f: CatalogField): string => f.key);
    for (const step of steps) {
      if (step.kind === OperationKind.CALCULATED && step.formula !== null) {
        const root: Nullable<Expression> = new Lexer()
          .tokenize(step.formula)
          .flatMap((tokens: Token[]): Result<Expression> => new Parser(resolver).parse(tokens))
          .match(
            (e: Expression): Nullable<Expression> => e,
            (): Nullable<Expression> => null,
          );
        if (root !== null) {
          this.formulas.set(step.id, root);
        }
      }
    }
  }

  public isEmpty(): boolean {
    return this.steps.length === 0;
  }

  public needsHistory(): boolean {
    return this.steps.some((s: OperationStepDto): boolean => s.kind === OperationKind.YEAR_TO_DATE);
  }

  /** Carga, por año, la historia necesaria para los acumulados de los períodos indicados. */
  public async prepare(periods: Iterable<string>, source: HistorySource): Promise<void> {
    if (!this.needsHistory()) {
      return;
    }
    const latestByYear: Map<string, string> = new Map<string, string>();
    for (const period of periods) {
      const year: string = period.slice(0, 4);
      const current: Nullable<string> = latestByYear.get(year) ?? null;
      if (!this.preparedYears.has(year) && (current === null || period > current)) {
        latestByYear.set(year, period);
      }
    }
    for (const [year, latest] of latestByYear) {
      this.preparedYears.add(year);
      for await (const record of source.between(`${year}-01`, latest)) {
        const values: Record<string, CellValue> = this.evaluate(record, false);
        for (const step of this.steps) {
          if (step.kind === OperationKind.YEAR_TO_DATE && step.sourceKey !== null) {
            this.remember(step.targetKey, this.group(record), record.period, values[step.sourceKey] ?? null);
          }
        }
      }
    }
  }

  /** El registro con los encabezados derivados calculados. */
  public apply(record: DataRecordSnapshot): DataRecordSnapshot {
    return this.isEmpty() ? record : { ...record, values: this.evaluate(record, true) };
  }

  private evaluate(record: DataRecordSnapshot, withYearToDate: boolean): Record<string, CellValue> {
    const values: Record<string, CellValue> = { ...record.values };
    for (const step of this.steps) {
      values[step.targetKey] = this.run(step, record, values, withYearToDate);
    }
    return values;
  }

  private run(
    step: OperationStepDto,
    record: DataRecordSnapshot,
    values: Record<string, CellValue>,
    withYearToDate: boolean,
  ): CellValue {
    switch (step.kind) {
      case OperationKind.CALCULATED: {
        const root: Nullable<Expression> = this.formulas.get(step.id) ?? null;
        return root === null
          ? null
          : OperationRunner.cell(new Evaluator(this.resolver, new RecordContext(values)).evaluate(root));
      }
      case OperationKind.YEAR_TO_DATE: {
        const own: Nullable<Decimal> = OperationRunner.decimal(
          step.sourceKey === null ? null : (values[step.sourceKey] ?? null),
        );
        return withYearToDate ? this.yearToDate(step.targetKey, record, own) : null;
      }
      case OperationKind.CURRENCY_CONVERSION: {
        const amount: Nullable<Decimal> = OperationRunner.decimal(
          step.sourceKey === null ? null : (values[step.sourceKey] ?? null),
        );
        const converted: Nullable<Decimal> =
          amount === null ? null : this.rates.convert(step, record.period, record.currency, amount);
        return converted === null ? null : converted.toString();
      }
    }
  }

  private yearToDate(targetKey: string, record: DataRecordSnapshot, own: Nullable<Decimal>): CellValue {
    const byGroup: Nullable<Map<string, Map<string, Decimal>>> = this.history.get(targetKey) ?? null;
    const sums: Nullable<Map<string, Decimal>> =
      byGroup === null ? null : (byGroup.get(this.group(record)) ?? null);
    let total: Nullable<Decimal> = own;
    for (const [period, sum] of sums === null ? [] : sums) {
      if (period < record.period && period.slice(0, 4) === record.period.slice(0, 4)) {
        total = (total ?? Decimal.zero()).add(sum);
      }
    }
    return total === null ? null : total.toString();
  }

  private remember(targetKey: string, group: string, period: string, raw: CellValue): void {
    const value: Nullable<Decimal> = OperationRunner.decimal(raw);
    if (value === null) {
      return;
    }
    const byGroup: Map<string, Map<string, Decimal>> = this.history.get(targetKey) ??
    new Map<string, Map<string, Decimal>>();
    const byPeriod: Map<string, Decimal> = byGroup.get(group) ?? new Map<string, Decimal>();
    byPeriod.set(period, (byPeriod.get(period) ?? Decimal.zero()).add(value));
    byGroup.set(group, byPeriod);
    this.history.set(targetKey, byGroup);
  }

  private group(record: DataRecordSnapshot): string {
    const ids: string[] = this.groupKeys.map((k: string): string => String(record.values[k] ?? ''));
    return JSON.stringify([record.profileId, record.companyId, record.currency, ...ids]);
  }

  private static decimal(raw: CellValue): Nullable<Decimal> {
    return typeof raw === 'string'
      ? Decimal.of(raw).match(
          (d: Decimal): Nullable<Decimal> => d,
          (): Nullable<Decimal> => null,
        )
      : null;
  }

  private static cell(value: FormulaValue): CellValue {
    return value instanceof Decimal ? value.toString() : value;
  }
}
