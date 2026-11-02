import { OperationKind, OperationStepDto, PresentationCurrencyDto } from '@asisteglt/shared-contracts';
import { Decimal, Nullable } from '@asisteglt/shared-kernel';
import { RateTable } from './operation-runner';

/**
 * Convierte los montos de una tabla de datos a su moneda de presentación. Cada registro usa la tasa
 * de su propio mes: un saldo de cierre queda a la tasa de cierre y un acumulado suma cada mes a su
 * tasa. Recuerda qué monedas y meses no tenían tasa, para avisarlo.
 */
export class PresentationConverter {
  private static readonly SAMPLE: number = 5;
  private readonly step: OperationStepDto;
  private readonly missing: Set<string> = new Set<string>();

  public constructor(
    dto: PresentationCurrencyDto,
    private readonly rates: RateTable,
  ) {
    this.step = {
      id: 'presentation',
      kind: OperationKind.CURRENCY_CONVERSION,
      targetKey: '',
      formula: null,
      sourceKey: null,
      collectionId: dto.collectionId,
      rateFieldKey: dto.rateFieldKey,
      currencyFieldKey: dto.currencyFieldKey,
      quote: dto.quote,
      targetCurrency: dto.targetCurrency,
    };
  }

  public target(): string {
    return this.step.targetCurrency ?? '';
  }

  /** `amount` en la moneda de presentación, o `null` (y se anota) si no hay tasa. */
  public convert(period: string, from: string, amount: Decimal): Nullable<Decimal> {
    const converted: Nullable<Decimal> = this.rates.convert(this.step, period, from, amount);
    if (converted === null) {
      this.missing.add(`${from} ${period}`);
    }
    return converted;
  }

  public warning(): Nullable<string> {
    if (this.missing.size === 0) {
      return null;
    }
    const sample: string[] = [...this.missing].sort().slice(0, PresentationConverter.SAMPLE);
    const more: string = this.missing.size > sample.length ? ', …' : '';
    return `No hay tipo de cambio a ${this.target()} para ${sample.join(', ')}${more}; esos montos no se incluyeron. Revisa la colección de tasas.`;
  }
}
