import { InventoryErrorCode, LocationRangeDto } from '@asisteglt/shared-contracts';
import { Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CounterAssignment } from './assignment-strategy';
import { InventoryItemSnapshot } from './inventory-records';
import { StorageLocation } from './tolerance';

/** Orden de recorrido: por ubicación y luego por SKU. */
function route(items: ReadonlyArray<InventoryItemSnapshot>): string[] {
  return [...items]
    .sort(
      (a: InventoryItemSnapshot, b: InventoryItemSnapshot): number =>
        StorageLocation.compare(a.location, b.location) || a.sku.localeCompare(b.sku),
    )
    .map((i: InventoryItemSnapshot): string => i.id);
}

function invalid(message: string): ValidationError {
  return new ValidationError(InventoryErrorCode.INVALID_STATE, message);
}

/**
 * Asignación manual por rangos de ubicación (p. ej. «A-01» a «A-20»): cada ítem va al contador
 * cuyo rango lo contiene. Los rangos no pueden solaparse ni dejar ítems fuera.
 */
export class RangeAssignmentStrategy {
  public plan(
    items: ReadonlyArray<InventoryItemSnapshot>,
    counters: ReadonlyArray<string>,
    ranges: ReadonlyArray<LocationRangeDto>,
  ): Result<CounterAssignment[]> {
    for (const range of ranges) {
      if (!counters.includes(range.userId)) {
        return Result.fail(invalid('Cada rango debe asignarse a un contador de la toma'));
      }
      if (
        range.from.trim() === '' ||
        range.to.trim() === '' ||
        StorageLocation.compare(range.from, range.to) > 0
      ) {
        return Result.fail(invalid(`Rango inválido: «${range.from}» a «${range.to}»`));
      }
    }
    const sorted: LocationRangeDto[] = [...ranges].sort((a: LocationRangeDto, b: LocationRangeDto): number =>
      StorageLocation.compare(a.from, b.from),
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const previous: Nullable<LocationRangeDto> = sorted[i - 1] ?? null;
      const current: Nullable<LocationRangeDto> = sorted[i] ?? null;
      if (previous !== null && current !== null && StorageLocation.compare(current.from, previous.to) <= 0) {
        return Result.fail(
          invalid(
            `Los rangos «${previous.from}–${previous.to}» y «${current.from}–${current.to}» se solapan`,
          ),
        );
      }
    }
    const byCounter: Map<string, InventoryItemSnapshot[]> = new Map<string, InventoryItemSnapshot[]>();
    let outside: number = 0;
    for (const item of items) {
      const range: Nullable<LocationRangeDto> =
        sorted.find(
          (r: LocationRangeDto): boolean =>
            StorageLocation.compare(item.location, r.from) >= 0 &&
            StorageLocation.compare(item.location, r.to) <= 0,
        ) ?? null;
      if (range === null) {
        outside += 1;
      } else {
        byCounter.set(range.userId, [...(byCounter.get(range.userId) ?? []), item]);
      }
    }
    if (outside > 0) {
      return Result.fail(
        invalid(`${String(outside)} ítems quedan fuera de los rangos; amplíalos o agrega otro`),
      );
    }
    return Result.ok(
      counters.map((userId: string): CounterAssignment => ({
        userId,
        itemIds: route(byCounter.get(userId) ?? []),
      })),
    );
  }
}

/**
 * Asignación por cercanía (clúster espacial) por bisección recursiva de coordenadas: corta la
 * bodega por el eje más largo en partes proporcionales al número de contadores, así cada uno
 * recibe un bloque contiguo y las cargas difieren a lo sumo en un ítem. Las coordenadas son
 * distancias en la bodega (no importes), por eso se calculan con `number`.
 */
export class ClusterAssignmentStrategy {
  public plan(
    items: ReadonlyArray<InventoryItemSnapshot>,
    counters: ReadonlyArray<string>,
  ): Result<CounterAssignment[]> {
    if (counters.length === 0) {
      return Result.ok([]);
    }
    const located: LocatedItem[] = [];
    for (const item of items) {
      const x: number = item.x === null ? Number.NaN : Number(item.x);
      const y: number = item.y === null ? Number.NaN : Number(item.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        located.push(new LocatedItem(item, x, y));
      }
    }
    if (located.length < items.length) {
      return Result.fail(
        invalid(
          `${String(items.length - located.length)} ítems no tienen coordenadas X/Y; cárgalas o usa otra estrategia`,
        ),
      );
    }
    const groups: LocatedItem[][] = ClusterAssignmentStrategy.split(located, counters.length);
    return Result.ok(
      counters.map((userId: string, i: number): CounterAssignment => ({
        userId,
        itemIds: route((groups[i] ?? []).map((l: LocatedItem): InventoryItemSnapshot => l.item)),
      })),
    );
  }

  private static split(items: ReadonlyArray<LocatedItem>, parts: number): LocatedItem[][] {
    if (parts <= 1) {
      return [[...items]];
    }
    const spread = (axis: (l: LocatedItem) => number): number =>
      items.length === 0 ? 0 : Math.max(...items.map(axis)) - Math.min(...items.map(axis));
    const byX = (l: LocatedItem): number => l.x;
    const byY = (l: LocatedItem): number => l.y;
    const axis: (l: LocatedItem) => number = spread(byX) >= spread(byY) ? byX : byY;
    const other: (l: LocatedItem) => number = axis === byX ? byY : byX;
    const sorted: LocatedItem[] = [...items].sort(
      (a: LocatedItem, b: LocatedItem): number =>
        axis(a) - axis(b) || other(a) - other(b) || a.item.id.localeCompare(b.item.id),
    );
    const left: number = Math.floor(parts / 2);
    const cut: number = Math.round((sorted.length * left) / parts);
    return [
      ...ClusterAssignmentStrategy.split(sorted.slice(0, cut), left),
      ...ClusterAssignmentStrategy.split(sorted.slice(cut), parts - left),
    ];
  }
}

class LocatedItem {
  public constructor(
    public readonly item: InventoryItemSnapshot,
    public readonly x: number,
    public readonly y: number,
  ) {}
}
