import { Nullable } from '@asisteglt/shared-kernel';

/** Colección en memoria de instantáneas inmutables, indexadas por `id`. */
export class InMemoryCollection<TSnapshot extends { readonly id: string }> {
  private readonly items: Map<string, TSnapshot> = new Map<string, TSnapshot>();

  public get(id: string): Nullable<TSnapshot> {
    return this.items.get(id) ?? null;
  }

  public find(predicate: (item: TSnapshot) => boolean): Nullable<TSnapshot> {
    for (const item of this.items.values()) {
      if (predicate(item)) {
        return item;
      }
    }
    return null;
  }

  public filter(predicate: (item: TSnapshot) => boolean): TSnapshot[] {
    return [...this.items.values()].filter(predicate);
  }

  public put(item: TSnapshot): void {
    this.items.set(item.id, item);
  }

  public delete(id: string): void {
    this.items.delete(id);
  }

  public all(): TSnapshot[] {
    return [...this.items.values()];
  }
}
