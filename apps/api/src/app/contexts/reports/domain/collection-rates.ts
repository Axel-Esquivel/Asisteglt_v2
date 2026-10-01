import { OperationStepDto, RateQuote } from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import { Decimal, Nullable } from '@asisteglt/shared-kernel';
import { RateTable } from './operation-runner';
import { SupplementaryCollection } from './supplementary-collection';

/** Tasa elegida para un período: la de su período o la más reciente anterior; `null` = vigente siempre. */
class RateCandidate {
  public constructor(
    public readonly period: Nullable<string>,
    public readonly rate: Decimal,
  ) {}

  public isBetterThan(other: Nullable<RateCandidate>): boolean {
    return other === null || (this.period !== null && (other.period === null || this.period > other.period));
  }
}

/**
 * Tasas tomadas de las colecciones del proyecto. Para un período usa la fila de ese período; si no
 * hay, la del período anterior más reciente y, por último, la fila sin período.
 */
export class CollectionRates extends RateTable {
  private readonly byId: ReadonlyMap<string, SupplementaryCollection>;

  public constructor(collections: ReadonlyArray<SupplementaryCollection>) {
    super();
    this.byId = new Map<string, SupplementaryCollection>(
      collections.map((c: SupplementaryCollection): [string, SupplementaryCollection] => [
        c.getId().toString(),
        c,
      ]),
    );
  }

  public override convert(
    step: OperationStepDto,
    period: string,
    from: string,
    amount: Decimal,
  ): Nullable<Decimal> {
    if (from === step.targetCurrency) {
      return amount;
    }
    const collection: Nullable<SupplementaryCollection> =
      step.collectionId === null ? null : (this.byId.get(step.collectionId) ?? null);
    if (
      collection === null ||
      step.rateFieldKey === null ||
      step.currencyFieldKey === null ||
      step.quote === null
    ) {
      return null;
    }
    const rate: Nullable<Decimal> = CollectionRates.rate(
      collection,
      step.rateFieldKey,
      step.currencyFieldKey,
      period,
      from,
    );
    if (rate === null || rate.isZero()) {
      return null;
    }
    switch (step.quote) {
      case RateQuote.TARGET_PER_UNIT:
        return amount.multiply(rate);
      case RateQuote.UNITS_PER_TARGET:
        return amount.divide(rate).match(
          (d: Decimal): Nullable<Decimal> => d,
          (): Nullable<Decimal> => null,
        );
    }
  }

  private static rate(
    collection: SupplementaryCollection,
    rateKey: string,
    currencyKey: string,
    period: string,
    from: string,
  ): Nullable<Decimal> {
    let best: Nullable<RateCandidate> = null;
    for (const row of collection.rows()) {
      const currency: CellValue = row.values[currencyKey] ?? null;
      const rate: Nullable<Decimal> = CollectionRates.decimal(row.values[rateKey] ?? null);
      if (typeof currency !== 'string' || currency.trim().toUpperCase() !== from || rate === null) {
        continue;
      }
      if (row.period !== null && row.period > period) {
        continue;
      }
      const candidate: RateCandidate = new RateCandidate(row.period, rate);
      if (candidate.isBetterThan(best)) {
        best = candidate;
      }
    }
    return best === null ? null : best.rate;
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
