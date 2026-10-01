import { DomainError } from '../errors/domain-error';
import { Nullable } from './nullable';

/** Resultado de una operación de negocio: éxito con valor o fallo con `DomainError`. */
export abstract class Result<T> {
  public static ok<T>(value: T): Result<T> {
    return new Ok<T>(value);
  }

  public static fail<T>(error: DomainError): Result<T> {
    return new Fail<T>(error);
  }

  /** Devuelve el primer fallo de la lista o un éxito con todos los valores. */
  public static all<T>(results: ReadonlyArray<Result<T>>): Result<T[]> {
    const values: T[] = [];
    for (const result of results) {
      const error: Nullable<DomainError> = result.errorOrNull();
      if (error !== null) {
        return Result.fail<T[]>(error);
      }
      values.push(result.unwrap());
    }
    return Result.ok<T[]>(values);
  }

  public abstract isOk(): boolean;
  public abstract map<R>(mapper: (value: T) => R): Result<R>;
  public abstract flatMap<R>(mapper: (value: T) => Result<R>): Result<R>;
  /** Como `flatMap`, pero con una función asíncrona; un fallo se propaga sin ejecutarla. */
  public abstract flatMapAsync<R>(mapper: (value: T) => Promise<Result<R>>): Promise<Result<R>>;
  public abstract match<R>(onOk: (value: T) => R, onFail: (error: DomainError) => R): R;
  /** Devuelve el valor o lanza el `DomainError` (la capa HTTP lo traduce). */
  public abstract unwrap(): T;
  public abstract errorOrNull(): Nullable<DomainError>;
}

class Ok<T> extends Result<T> {
  public constructor(private readonly value: T) {
    super();
  }

  public override isOk(): boolean {
    return true;
  }

  public override map<R>(mapper: (value: T) => R): Result<R> {
    return Result.ok<R>(mapper(this.value));
  }

  public override flatMap<R>(mapper: (value: T) => Result<R>): Result<R> {
    return mapper(this.value);
  }

  public override flatMapAsync<R>(mapper: (value: T) => Promise<Result<R>>): Promise<Result<R>> {
    return mapper(this.value);
  }

  public override match<R>(onOk: (value: T) => R, _onFail: (error: DomainError) => R): R {
    return onOk(this.value);
  }

  public override unwrap(): T {
    return this.value;
  }

  public override errorOrNull(): Nullable<DomainError> {
    return null;
  }
}

class Fail<T> extends Result<T> {
  public constructor(private readonly error: DomainError) {
    super();
  }

  public override isOk(): boolean {
    return false;
  }

  public override map<R>(_mapper: (value: T) => R): Result<R> {
    return Result.fail<R>(this.error);
  }

  public override flatMapAsync<R>(_mapper: (value: T) => Promise<Result<R>>): Promise<Result<R>> {
    return Promise.resolve(Result.fail<R>(this.error));
  }

  public override flatMap<R>(_mapper: (value: T) => Result<R>): Result<R> {
    return Result.fail<R>(this.error);
  }

  public override match<R>(_onOk: (value: T) => R, onFail: (error: DomainError) => R): R {
    return onFail(this.error);
  }

  public override unwrap(): T {
    throw this.error;
  }

  public override errorOrNull(): Nullable<DomainError> {
    return this.error;
  }
}
