import { OperationKind, RateQuote, OperationStepDto, OperationsRequest } from '@asisteglt/shared-contracts';
import { Decoder, FieldDecoder, FieldReader, Result } from '@asisteglt/shared-kernel';

/** Validación del cuerpo JSON de las operaciones (compartible con el navegador). */
export class OperationsParsers {
  public static readonly STEP: Decoder<OperationStepDto> = new FieldDecoder<OperationStepDto>(
    (f: FieldReader): OperationStepDto => ({
      id: f.string('id'),
      kind: f.oneOf('kind', Object.values(OperationKind)),
      targetKey: f.string('targetKey'),
      formula: f.nullableString('formula'),
      sourceKey: f.nullableString('sourceKey'),
      collectionId: f.nullableString('collectionId'),
      rateFieldKey: f.nullableString('rateFieldKey'),
      currencyFieldKey: f.nullableString('currencyFieldKey'),
      quote: f.nullableString('quote') === null ? null : f.oneOf('quote', Object.values(RateQuote)),
      targetCurrency: f.nullableString('targetCurrency'),
    }),
  );

  private static readonly REQUEST: Decoder<OperationsRequest> = new FieldDecoder<OperationsRequest>(
    (f: FieldReader): OperationsRequest => ({ steps: f.list('steps', OperationsParsers.STEP) }),
  );

  public static request(body: unknown): Result<OperationsRequest> {
    return OperationsParsers.REQUEST.decode(body);
  }
}
