import {
  CountEntryRequest,
  CreateCountRequest,
  InventoryItemRequest,
  ItemCondition,
  ItemFieldMapping,
  ItemsFromDataRequest,
  ParticipantDto,
  ParticipantRole,
  ReassignRequest,
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
      x: f.nullableString('x'),
      y: f.nullableString('y'),
    }),
  );

  public static fromData(body: unknown): Result<ItemsFromDataRequest> {
    return new FieldDecoder<ItemsFromDataRequest>((f: FieldReader): ItemsFromDataRequest => ({
      profileId: f.nullableString('profileId'),
      period: f.string('period'),
      companyId: f.nullableString('companyId'),
      mapping: f.nested(
        'mapping',
        new FieldDecoder<ItemFieldMapping>((m: FieldReader): ItemFieldMapping => ({
          sku: m.string('sku'),
          description: m.string('description'),
          unit: m.nullableString('unit'),
          location: m.string('location'),
          expected: m.string('expected'),
          unitCost: m.nullableString('unitCost'),
          x: m.nullableString('x'),
          y: m.nullableString('y'),
        })),
      ),
    })).decode(body);
  }

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
      condition:
        f.raw('condition') === null ? ItemCondition.OK : f.oneOf('condition', Object.values(ItemCondition)),
    })).decode(body);
  }

  public static reassign(body: unknown): Result<ReassignRequest> {
    return new FieldDecoder<ReassignRequest>((f: FieldReader): ReassignRequest => ({
      fromUserId: f.string('fromUserId'),
      toUserId: f.string('toUserId'),
    })).decode(body);
  }
}
