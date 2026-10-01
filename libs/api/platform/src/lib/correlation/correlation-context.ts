import { AsyncLocalStorage } from 'node:async_hooks';
import { Nullable } from '@asisteglt/shared-kernel';

/** Guarda el identificador de correlación de la petición en curso. */
export class CorrelationContext {
  private static readonly STORAGE: AsyncLocalStorage<string> = new AsyncLocalStorage<string>();

  public static run<R>(correlationId: string, callback: () => R): R {
    return CorrelationContext.STORAGE.run(correlationId, callback);
  }

  public static current(): Nullable<string> {
    return CorrelationContext.STORAGE.getStore() ?? null;
  }
}
