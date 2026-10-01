import { ItemStatusResponse } from '@asisteglt/shared-contracts';
import { Decimal, Nullable } from '@asisteglt/shared-kernel';
import { CountEntrySnapshot, InventoryItemSnapshot } from '../domain/inventory-records';
import { StorageLocation, Tolerance } from '../domain/tolerance';

/** Estado vigente de cada ítem: el último conteo de la ronda más reciente en que se contó. */
export class CountLedger {
  private readonly latest: Map<string, CountEntrySnapshot> = new Map<string, CountEntrySnapshot>();
  private readonly rounds: Map<string, Set<number>> = new Map<string, Set<number>>();

  public constructor(
    private readonly items: ReadonlyArray<InventoryItemSnapshot>,
    entries: ReadonlyArray<CountEntrySnapshot>,
    private readonly tolerance: Tolerance,
  ) {
    for (const entry of entries) {
      const current: Nullable<CountEntrySnapshot> = this.latest.get(entry.itemId) ?? null;
      const newer: boolean =
        current === null ||
        entry.round > current.round ||
        (entry.round === current.round && entry.recordedAt.getTime() >= current.recordedAt.getTime());
      if (newer) {
        this.latest.set(entry.itemId, entry);
      }
      this.rounds.set(entry.itemId, new Set<number>([...(this.rounds.get(entry.itemId) ?? []), entry.round]));
    }
  }

  public entryOf(itemId: string): Nullable<CountEntrySnapshot> {
    return this.latest.get(itemId) ?? null;
  }

  /** Conteo vigente en una ronda concreta (para la vista de quien cuenta). */
  public countedIn(itemId: string, round: number): Nullable<string> {
    const entry: Nullable<CountEntrySnapshot> = this.entryOf(itemId);
    return entry !== null && entry.round === round ? entry.quantity : null;
  }

  public exceeds(item: InventoryItemSnapshot): boolean {
    const entry: Nullable<CountEntrySnapshot> = this.entryOf(item.id);
    return (
      entry === null ||
      this.tolerance.isExceededBy(
        Decimal.of(item.expectedQuantity).unwrap(),
        Decimal.of(entry.quantity).unwrap(),
      )
    );
  }

  public statuses(names: ReadonlyMap<string, string>): ItemStatusResponse[] {
    return [...this.items]
      .sort(
        (a: InventoryItemSnapshot, b: InventoryItemSnapshot): number =>
          StorageLocation.compare(a.location, b.location) || a.sku.localeCompare(b.sku),
      )
      .map((item: InventoryItemSnapshot): ItemStatusResponse => {
        const entry: Nullable<CountEntrySnapshot> = this.entryOf(item.id);
        const expected: Decimal = Decimal.of(item.expectedQuantity).unwrap();
        const difference: Nullable<Decimal> =
          entry === null ? null : Decimal.of(entry.quantity).unwrap().subtract(expected);
        const cost: Nullable<Decimal> = item.unitCost === null ? null : Decimal.of(item.unitCost).unwrap();
        return {
          itemId: item.id,
          sku: item.sku,
          description: item.description,
          location: item.location,
          expected: item.expectedQuantity,
          counted: entry === null ? null : entry.quantity,
          difference: difference === null ? null : difference.toString(),
          differenceValue: difference === null || cost === null ? null : difference.multiply(cost).toFixed(2),
          exceedsTolerance: entry !== null && this.exceeds(item),
          rounds: (this.rounds.get(item.id) ?? new Set<number>()).size,
          counterName: entry === null ? null : (names.get(entry.counterId) ?? null),
        };
      });
  }

  public totalDifferenceValue(statuses: ReadonlyArray<ItemStatusResponse>): string {
    return statuses
      .reduce(
        (sum: Decimal, s: ItemStatusResponse): Decimal =>
          s.differenceValue === null ? sum : sum.add(Decimal.of(s.differenceValue).unwrap()),
        Decimal.zero(),
      )
      .toFixed(2);
  }
}
