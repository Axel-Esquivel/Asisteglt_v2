import { Optional } from '../core/optional';

/** Diccionario de solo lectura cuya búsqueda devuelve `Optional` en lugar de `undefined`. */
export class ReadonlyDictionary<K, V> {
  private constructor(private readonly entries: ReadonlyMap<K, V>) {}

  public static from<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyDictionary<K, V> {
    return new ReadonlyDictionary<K, V>(new Map<K, V>(entries));
  }

  public static empty<K, V>(): ReadonlyDictionary<K, V> {
    return new ReadonlyDictionary<K, V>(new Map<K, V>());
  }

  public get(key: K): Optional<V> {
    return this.entries.has(key) ? Optional.fromNullable<V>(this.entries.get(key) ?? null) : Optional.empty<V>();
  }

  public has(key: K): boolean {
    return this.entries.has(key);
  }

  public size(): number {
    return this.entries.size;
  }

  public keys(): K[] {
    return [...this.entries.keys()];
  }

  public values(): V[] {
    return [...this.entries.values()];
  }

  public with(key: K, value: V): ReadonlyDictionary<K, V> {
    const copy: Map<K, V> = new Map<K, V>(this.entries);
    copy.set(key, value);
    return new ReadonlyDictionary<K, V>(copy);
  }
}
