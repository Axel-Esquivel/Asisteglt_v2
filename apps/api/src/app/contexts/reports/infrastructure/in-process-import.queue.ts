import { Injectable, Logger } from '@nestjs/common';
import { ImportProcessor } from '../application/import.processor';
import { ImportQueue } from '../domain/ports';

/**
 * Cola en proceso: procesa los ítems de uno en uno, sin bloquear la petición que los encoló.
 * Adecuada para un solo servidor (incluido el servidor local sin internet); con varias instancias
 * se sustituye por BullMQ sobre Redis con el mismo contrato.
 */
@Injectable()
export class InProcessImportQueue extends ImportQueue {
  private readonly logger: Logger = new Logger(InProcessImportQueue.name);
  private tail: Promise<void> = Promise.resolve();

  public constructor(private readonly processor: ImportProcessor) {
    super();
  }

  public override enqueue(batchId: string, itemId: string): void {
    this.tail = this.tail
      .then(
        (): Promise<void> =>
          new Promise<void>((resolve: () => void): void => {
            setImmediate(resolve);
          }),
      )
      .then((): Promise<void> => this.processor.process(batchId, itemId))
      .catch((error: unknown): void => {
        this.logger.error(
          `Error en la cola de importación: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  public override idle(): Promise<void> {
    return this.tail;
  }
}
