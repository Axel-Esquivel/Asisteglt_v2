import { Aggregation } from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import {
  AggregateRequest,
  EvaluationContext,
  FormulaContext,
  RawValue,
} from '@asisteglt/shared-formula-engine';
import { Decimal, Nullable } from '@asisteglt/shared-kernel';
import { Accumulator } from './accumulator';

/**
 * Agregaciones precalculadas sobre un conjunto de registros (las que piden unas fórmulas) y el
 * contexto agregado que las responde al evaluarlas.
 */
export class RecordAggregates extends EvaluationContext {
  private readonly accumulators: Map<string, Accumulator> = new Map<string, Accumulator>();
  /** Sin repetir: varias fórmulas pueden pedir la misma agregación. */
  private readonly requests: AggregateRequest[] = [];

  public constructor(requests: ReadonlyArray<AggregateRequest>) {
    super();
    for (const request of requests) {
      if (!this.accumulators.has(request.id())) {
        this.accumulators.set(request.id(), new Accumulator(request.aggregation));
        this.requests.push(request);
      }
    }
  }

  public add(values: Readonly<Record<string, CellValue>>): void {
    for (const request of this.requests) {
      const accumulator: Nullable<Accumulator> = this.accumulators.get(request.id()) ?? null;
      if (accumulator !== null) {
        accumulator.add(
          RecordAggregates.decimal(values[request.key] ?? null),
          request.weightKey === null ? null : RecordAggregates.decimal(values[request.weightKey] ?? null),
        );
      }
    }
  }

  public override kind(): FormulaContext {
    return FormulaContext.AGGREGATE;
  }

  public override raw(_key: string): RawValue {
    return null;
  }

  public override aggregate(
    key: string,
    aggregation: Aggregation,
    weightKey: Nullable<string>,
  ): Nullable<Decimal> {
    const accumulator: Nullable<Accumulator> =
      this.accumulators.get(AggregateRequest.idOf(key, aggregation, weightKey)) ?? null;
    const text: Nullable<string> = accumulator === null ? null : accumulator.result();
    return RecordAggregates.decimal(text);
  }

  private static decimal(raw: CellValue): Nullable<Decimal> {
    return typeof raw === 'string'
      ? Decimal.of(raw).match(
          (d: Decimal): Nullable<Decimal> => d,
          (): Nullable<Decimal> => null,
        )
      : null;
  }
}
