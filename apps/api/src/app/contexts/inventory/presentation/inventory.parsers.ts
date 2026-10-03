import {
  AssignmentMode,
  CountEntryRequest,
  CountPackageDto,
  CreateCountRequest,
  InventoryItemRequest,
  ItemCondition,
  ItemFieldMapping,
  ItemsFromDataRequest,
  LocationRangeDto,
  PackageItemDto,
  ParticipantDto,
  ParticipantRole,
  ReassignRequest,
  StartCountRequest,
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

  /** Sin cuerpo (o sin modo) se asigna por zonas, como antes. */
  public static start(body: unknown): Result<StartCountRequest> {
    if (typeof body !== 'object' || body === null || !('mode' in body)) {
      return Result.ok({ mode: AssignmentMode.ZONES, ranges: [] });
    }
    return new FieldDecoder<StartCountRequest>((f: FieldReader): StartCountRequest => ({
      mode: f.oneOf('mode', Object.values(AssignmentMode)),
      ranges:
        f.raw('ranges') === null
          ? []
          : f.list(
              'ranges',
              new FieldDecoder<LocationRangeDto>((r: FieldReader): LocationRangeDto => ({
                userId: r.string('userId'),
                from: r.string('from'),
                to: r.string('to'),
              })),
            ),
    })).decode(body);
  }

  public static countPackage(body: unknown): Result<CountPackageDto> {
    return new FieldDecoder<CountPackageDto>((f: FieldReader): CountPackageDto => ({
      format: f.oneOf('format', ['asisteglt.inventory-count']),
      version: f.number('version'),
      exportedAt: f.string('exportedAt'),
      settings: f.nested(
        'settings',
        new FieldDecoder<CreateCountRequest>((s: FieldReader): CreateCountRequest => ({
          name: s.string('name'),
          warehouse: s.string('warehouse'),
          toleranceKind: s.oneOf('toleranceKind', Object.values(ToleranceKind)),
          toleranceValue: s.string('toleranceValue'),
          maxRounds: s.number('maxRounds'),
        })),
      ),
      items: f.list(
        'items',
        new FieldDecoder<PackageItemDto>((i: FieldReader): PackageItemDto => ({
          sku: i.string('sku'),
          description: i.string('description'),
          unit: i.string('unit'),
          location: i.string('location'),
          expectedQuantity: i.string('expectedQuantity'),
          unitCost: i.nullableString('unitCost'),
          x: i.nullableString('x'),
          y: i.nullableString('y'),
          counted: i.nullableString('counted'),
          condition: i.raw('condition') === null ? null : i.oneOf('condition', Object.values(ItemCondition)),
          comment: i.string('comment'),
          counter: i.string('counter'),
          rounds: i.number('rounds'),
        })),
      ),
    })).decode(body);
  }

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
