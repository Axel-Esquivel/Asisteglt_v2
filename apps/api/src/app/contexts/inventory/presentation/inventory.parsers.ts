import {
  CountEntryRequest,
  CreateCountRequest,
  InventoryItemRequest,
  ParticipantDto,
  ParticipantRole,
  ToleranceKind,
} from '@asisteglt/shared-contracts';
import { FieldDecoder, FieldReader, Result } from '@asisteglt/shared-kernel';

/** Validación de los cuerpos JSON de inventario (recibidos como `unknown`). */
export class InventoryParsers {
  private static readonly ITEM: FieldDecoder<InventoryItemRequest> = new FieldDecoder<InventoryItemRequest>(
    (f: FieldReader): InventoryItemRequest => ({
      sku: f.string('sku'),
      description: f.string('description'),
      unit: f.string('unit'),
      location: f.string('location'),
      expectedQuantity: f.string('expectedQuantity'),
      unitCost: f.nullableString('unitCost'),
    }),
  );

  private static readonly PARTICIPANT: FieldDecoder<ParticipantDto> = new FieldDecoder<ParticipantDto>(
    (f: FieldReader): ParticipantDto => ({
      userId: f.string('userId'),
      role: f.oneOf('role', Object.values(ParticipantRole)),
    }),
  );

  public static count(body: unknown): Result<CreateCountRequest> {
    return new FieldDecoder<CreateCountRequest>((f: FieldReader): CreateCountRequest => ({
      name: f.string('name'),
      warehouse: f.string('warehouse'),
      toleranceKind: f.oneOf('toleranceKind', Object.values(ToleranceKind)),
      toleranceValue: f.string('toleranceValue'),
      maxRounds: f.number('maxRounds'),
    })).decode(body);
  }

  public static items(body: unknown): Result<InventoryItemRequest[]> {
    return new FieldDecoder<InventoryItemRequest[]>((f: FieldReader): InventoryItemRequest[] =>
      f.list('items', InventoryParsers.ITEM),
    ).decode(body);
  }

  public static participants(body: unknown): Result<ParticipantDto[]> {
    return new FieldDecoder<ParticipantDto[]>((f: FieldReader): ParticipantDto[] =>
      f.list('participants', InventoryParsers.PARTICIPANT),
    ).decode(body);
  }

  public static entry(body: unknown): Result<CountEntryRequest> {
    return new FieldDecoder<CountEntryRequest>((f: FieldReader): CountEntryRequest => ({
      itemId: f.string('itemId'),
      quantity: f.string('quantity'),
      comment: f.string('comment'),
    })).decode(body);
  }
}
