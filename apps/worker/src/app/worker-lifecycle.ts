import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { WorkerConfig } from './worker-config';

/** Ciclo de vida del worker: punto de registro de consumidores de colas en fases posteriores. */
@Injectable()
export class WorkerLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger: Logger = new Logger(WorkerLifecycle.name);

  public constructor(private readonly config: WorkerConfig) {}

  public onApplicationBootstrap(): void {
    this.logger.log(`Worker listo (entorno ${this.config.environment}, concurrencia ${String(this.config.concurrency)})`);
  }

  public onApplicationShutdown(signal: string): void {
    this.logger.log(`Worker detenido (${signal})`);
  }
}
