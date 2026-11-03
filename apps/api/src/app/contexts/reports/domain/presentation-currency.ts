import {
  CollectionFieldDto,
  DataType,
  NumericNature,
  OperationKind,
  OperationStepDto,
  PresentationCurrencyDto,
} from '@asisteglt/shared-contracts';
import { Decimal, Nullable } from '@asisteglt/shared-kernel';
import { RateTable } from './operation-runner';
import { SupplementaryCollection } from './supplementary-collection';

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

  /**
   * Motivo por el que la configuración no sirve con las colecciones del proyecto (la colección no
   * existe, el campo de tasa no es una Tasa o el de moneda no es texto), o `null` si sirve.
   */
  public static problem(
    dto: PresentationCurrencyDto,
    collections: ReadonlyArray<SupplementaryCollection>,
  ): Nullable<string> {
    const collection: Nullable<SupplementaryCollection> =
      collections.find((c: SupplementaryCollection): boolean => c.getId().toString() === dto.collectionId) ??
      null;
    if (collection === null) {
      return 'La colección de tasas de la moneda de presentación no existe';
    }
    const rate: Nullable<CollectionFieldDto> = collection.field(dto.rateFieldKey);
    const currency: Nullable<CollectionFieldDto> = collection.field(dto.currencyFieldKey);
    if (rate === null || rate.nature !== NumericNature.RATE) {
      return 'El campo de tasa de la moneda de presentación debe tener naturaleza Tasa';
    }
    if (currency === null || currency.dataType !== DataType.TEXT) {
      return 'El campo de moneda de la moneda de presentación debe ser de texto';
    }
    return null;
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
