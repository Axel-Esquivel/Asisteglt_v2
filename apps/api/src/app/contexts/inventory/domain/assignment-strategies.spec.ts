import { Nullable } from '@asisteglt/shared-kernel';
import { ClusterAssignmentStrategy, RangeAssignmentStrategy } from './assignment-strategies';
import { CounterAssignment, ZoneAssignmentStrategy } from './assignment-strategy';
import { InventoryItemSnapshot } from './inventory-records';
import { StorageLocation } from './tolerance';

/** Bodega FICTICIA: `aisles` pasillos (P01…), `perAisle` posiciones por pasillo, 3 m entre pasillos. */
const warehouse = (aisles: number, perAisle: number): InventoryItemSnapshot[] => {
  const items: InventoryItemSnapshot[] = [];
  for (let a = 1; a <= aisles; a += 1) {
    for (let p = 1; p <= perAisle; p += 1) {
      const aisle: string = `P${String(a).padStart(2, '0')}`;
      items.push({
        id: `${aisle}-${String(p)}`,
        countId: 'c',
        sku: `SKU-${aisle}-${String(p)}`,
        description: '',
        unit: 'u',
        location: `${aisle}-${String(p).padStart(3, '0')}`,
        expectedQuantity: '1',
        unitCost: null,
        x: String(a * 3),
        y: String(p),
      });
    }
  }
  return items;
};

const sizes = (plan: ReadonlyArray<CounterAssignment>): number[] =>
  plan.map((a: CounterAssignment): number => a.itemIds.length);
const spread = (plan: ReadonlyArray<CounterAssignment>): number => {
  const s: number[] = sizes(plan);
  return (Math.max(...s) - Math.min(...s)) / Math.max(...s);
};

describe('Estrategias de asignación', () => {
  const counters: string[] = ['u1', 'u2', 'u3', 'u4'];
  const items: InventoryItemSnapshot[] = warehouse(20, 100);

  it('por zonas: 4 contadores y 2 000 ítems en 20 pasillos, sin compartir pasillos y con carga pareja', () => {
    const plan: CounterAssignment[] = new ZoneAssignmentStrategy().plan(
      items,
      counters,
      new Map<string, string>(),
    );
    expect(sizes(plan).reduce((a: number, b: number): number => a + b, 0)).toBe(2000);
    expect(spread(plan)).toBeLessThan(0.1);
    const owner: Map<string, string> = new Map<string, string>();
    for (const a of plan) {
      for (const id of a.itemIds) {
        const aisle: string = StorageLocation.zoneOf(id);
        const previous: Nullable<string> = owner.get(aisle) ?? null;
        expect(previous === null || previous === a.userId).toBe(true);
        owner.set(aisle, a.userId);
      }
    }
  });

  it('por cercanía: bloques contiguos que no se cruzan y cargas que difieren a lo sumo en un ítem', () => {
    const plan: CounterAssignment[] = new ClusterAssignmentStrategy().plan(items, counters).match(
      (p: CounterAssignment[]): CounterAssignment[] => p,
      (): CounterAssignment[] => [],
    );
    expect(sizes(plan)).toEqual([500, 500, 500, 500]);
    const byId: Map<string, InventoryItemSnapshot> = new Map<string, InventoryItemSnapshot>(
      items.map((i: InventoryItemSnapshot): [string, InventoryItemSnapshot] => [i.id, i]),
    );
    const box = (a: CounterAssignment): number[] => {
      const located: InventoryItemSnapshot[] = a.itemIds
        .map((id: string): Nullable<InventoryItemSnapshot> => byId.get(id) ?? null)
        .filter((i: Nullable<InventoryItemSnapshot>): i is InventoryItemSnapshot => i !== null);
      const xs: number[] = located.map((i: InventoryItemSnapshot): number => Number(i.x));
      const ys: number[] = located.map((i: InventoryItemSnapshot): number => Number(i.y));
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    };
    const boxes: number[][] = plan.map(box);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [ax1 = 0, ax2 = 0, ay1 = 0, ay2 = 0] = boxes[i] ?? [];
        const [bx1 = 0, bx2 = 0, by1 = 0, by2 = 0] = boxes[j] ?? [];
        const overlap: boolean = ax1 < bx2 && bx1 < ax2 && ay1 < by2 && by1 < ay2;
        expect(overlap).toBe(false);
      }
    }
    const missing: InventoryItemSnapshot[] = warehouse(1, 1).map(
      (i: InventoryItemSnapshot): InventoryItemSnapshot => ({ ...i, x: null }),
    );
    expect(new ClusterAssignmentStrategy().plan(missing, counters).isOk()).toBe(false);
  });

  it('por rangos: asigna por ubicación y rechaza solapes o ítems fuera de rango', () => {
    const ranges = [
      { userId: 'u1', from: 'P01', to: 'P05-999' },
      { userId: 'u2', from: 'P06', to: 'P20-999' },
    ];
    const plan: CounterAssignment[] = new RangeAssignmentStrategy().plan(items, counters, ranges).match(
      (p: CounterAssignment[]): CounterAssignment[] => p,
      (): CounterAssignment[] => [],
    );
    expect(sizes(plan)).toEqual([500, 1500, 0, 0]);
    expect(new RangeAssignmentStrategy().plan(items, counters, ranges.slice(0, 1)).isOk()).toBe(false);
    expect(
      new RangeAssignmentStrategy()
        .plan(items, counters, [...ranges, { userId: 'u3', from: 'P05', to: 'P07' }])
        .isOk(),
    ).toBe(false);
  });
});
