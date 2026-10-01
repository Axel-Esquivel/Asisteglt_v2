import { Nullable } from './nullable';

/**
 * Contenedor de un valor que puede no existir. Evita propagar `null` y prohíbe `undefined`.
 */
export abstract class Optional<T> {
  public static of<T>(value: T): Optional<T> {
    return new Present<T>(value);
  }

  public static empty<T>(): Optional<T> {
    return new Empty<T>();
  }

  public static fromNullable<T>(value: Nullable<T>): Optional<T> {
    return value === null ? Optional.empty<T>() : Optional.of<T>(value);
  }

  public abstract isPresent(): boolean;
  public abstract map<R>(mapper: (value: T) => R): Optional<R>;
  public abstract flatMap<R>(mapper: (value: T) => Optional<R>): Optional<R>;
  public abstract filter(predicate: (value: T) => boolean): Optional<T>;
  public abstract orElse(fallback: T): T;
  public abstract orElseGet(supplier: () => T): T;
  public abstract orElseThrow(factory: () => Error): T;
  public abstract toNullable(): Nullable<T>;
}

class Present<T> extends Optional<T> {
  public constructor(private readonly value: T) {
    super();
  }

  public override isPresent(): boolean {
    return true;
  }

  public override map<R>(mapper: (value: T) => R): Optional<R> {
    return Optional.of<R>(mapper(this.value));
  }

  public override flatMap<R>(mapper: (value: T) => Optional<R>): Optional<R> {
    return mapper(this.value);
  }

  public override filter(predicate: (value: T) => boolean): Optional<T> {
    return predicate(this.value) ? this : Optional.empty<T>();
  }

  public override orElse(_fallback: T): T {
    return this.value;
  }

  public override orElseGet(_supplier: () => T): T {
    return this.value;
  }

  public override orElseThrow(_factory: () => Error): T {
    return this.value;
  }

  public override toNullable(): Nullable<T> {
    return this.value;
  }
}

class Empty<T> extends Optional<T> {
  public override isPresent(): boolean {
    return false;
  }

  public override map<R>(_mapper: (value: T) => R): Optional<R> {
    return Optional.empty<R>();
  }

  public override flatMap<R>(_mapper: (value: T) => Optional<R>): Optional<R> {
    return Optional.empty<R>();
  }

  public override filter(_predicate: (value: T) => boolean): Optional<T> {
    return this;
  }

  public override orElse(fallback: T): T {
    return fallback;
  }

  public override orElseGet(supplier: () => T): T {
    return supplier();
  }

  public override orElseThrow(factory: () => Error): T {
    throw factory();
  }

  public override toNullable(): Nullable<T> {
    return null;
  }
}
