import { ELDHistogram, monitorEventLoopDelay } from 'node:perf_hooks';
import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { MetricsRegistry } from '@asisteglt/api-platform';
import { AppConfig } from '../../config/app-config';

/** Indicadores del proceso Node: memoria, tiempo activo, retraso del *event loop* y versión. */
@Injectable()
export class ProcessMetrics implements OnModuleInit, OnApplicationShutdown {
  private readonly loopDelay: ELDHistogram = monitorEventLoopDelay({ resolution: 20 });

  public constructor(
    private readonly metrics: MetricsRegistry,
    private readonly config: AppConfig,
  ) {}

  public onModuleInit(): void {
    this.loopDelay.enable();
    this.metrics.gauge(
      'asisteglt_process_resident_memory_bytes',
      'Memoria residente del proceso',
      (): number => process.memoryUsage().rss,
    );
    this.metrics.gauge(
      'asisteglt_process_heap_used_bytes',
      'Heap de V8 en uso',
      (): number => process.memoryUsage().heapUsed,
    );
    this.metrics.gauge('asisteglt_process_uptime_seconds', 'Tiempo activo del proceso', (): number =>
      Math.round(process.uptime()),
    );
    this.metrics.gauge(
      'asisteglt_event_loop_delay_p99_seconds',
      'Percentil 99 del retraso del event loop',
      (): number => this.loopDelay.percentile(99) / 1e9,
    );
    this.metrics.info('asisteglt_build_info', 'Versión desplegada de la API', {
      version: this.config.version,
      environment: this.config.environment,
    });
  }

  public onApplicationShutdown(): void {
    this.loopDelay.disable();
  }
}
