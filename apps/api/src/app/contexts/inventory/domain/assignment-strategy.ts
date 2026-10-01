import { Nullable } from '@asisteglt/shared-kernel';
import { InventoryItemSnapshot } from './inventory-records';
import { StorageLocation } from './tolerance';

export interface CounterAssignment {
  readonly userId: string;
  readonly itemIds: ReadonlyArray<string>;
}

/**
 * Asignación por zonas (docs/04 §13): cada zona completa va a un contador, empezando por las
 * zonas más grandes y eligiendo al contador con menos ítems; la ruta sigue el orden de ubicación.
 * En un reconteo se evita al contador que contó el ítem antes, si hay otro disponible.
 */
export class ZoneAssignmentStrategy {
  public plan(
    items: ReadonlyArray<InventoryItemSnapshot>,
    counters: ReadonlyArray<string>,
    previousCounter: ReadonlyMap<string, string>,
  ): CounterAssignment[] {
    if (counters.length === 0) {
      return [];
    }
    const zones: Map<string, InventoryItemSnapshot[]> = new Map<string, InventoryItemSnapshot[]>();
    for (const item of items) {
      const zone: string = StorageLocation.zoneOf(item.location);
      zones.set(zone, [...(zones.get(zone) ?? []), item]);
    }
    const load: Map<string, InventoryItemSnapshot[]> = new Map<string, InventoryItemSnapshot[]>(
      counters.map((c: string): [string, InventoryItemSnapshot[]] => [c, []]),
    );
    const ordered: InventoryItemSnapshot[][] = [...zones.values()].sort(
      (a: InventoryItemSnapshot[], b: InventoryItemSnapshot[]): number => b.length - a.length,
    );
    for (const zoneItems of ordered) {
      const avoid: Set<string> = new Set<string>(
        zoneItems
          .map((i: InventoryItemSnapshot): Nullable<string> => previousCounter.get(i.id) ?? null)
          .filter((c: Nullable<string>): c is string => c !== null),
      );
      const candidates: string[] = counters.filter((c: string): boolean => !avoid.has(c));
      const pool: string[] = candidates.length > 0 ? candidates : [...counters];
      const chosen: string = pool.reduce((best: string, c: string): string =>
        (load.get(c) ?? []).length < (load.get(best) ?? []).length ? c : best,
      );
      load.set(chosen, [...(load.get(chosen) ?? []), ...zoneItems]);
    }
    return counters.map((userId: string): CounterAssignment => ({
      userId,
      itemIds: (load.get(userId) ?? [])
        .sort(
          (a: InventoryItemSnapshot, b: InventoryItemSnapshot): number =>
            StorageLocation.compare(a.location, b.location) || a.sku.localeCompare(b.sku),
        )
        .map((i: InventoryItemSnapshot): string => i.id),
    }));
  }
}
