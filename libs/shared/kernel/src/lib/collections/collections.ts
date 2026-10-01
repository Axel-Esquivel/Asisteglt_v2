import { Optional } from '../core/optional';

/** Operaciones sobre arreglos que, en la API estándar, devolverían `undefined`. */
export class Collections {
  public static findFirst<T>(items: ReadonlyArray<T>, predicate: (item: T) => boolean): Optional<T> {
    for (const item of items) {
      if (predicate(item)) {
        return Optional.of<T>(item);
      }
    }
    return Optional.empty<T>();
  }

  public static at<T>(items: ReadonlyArray<T>, index: number): Optional<T> {
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      return Optional.empty<T>();
    }
    return Optional.fromNullable<T>(items[index] ?? null);
  }

  public static first<T>(items: ReadonlyArray<T>): Optional<T> {
    return Collections.at<T>(items, 0);
  }

  public static last<T>(items: ReadonlyArray<T>): Optional<T> {
    return Collections.at<T>(items, items.length - 1);
  }
}
