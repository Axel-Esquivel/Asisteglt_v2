import { Injectable } from '@nestjs/common';
import {
  DependencyCheckDto,
  HealthResponse,
  ReadinessResponse,
  ServiceStatus,
} from '@asisteglt/shared-contracts';
import { Clock, Nullable } from '@asisteglt/shared-kernel';
import { AppConfig } from '../config/app-config';
import { ReadinessProbe, ReadinessProbes } from './readiness-probes';

/** Estado de la API: vida (`check`) y preparación con sus dependencias (`readiness`). */
@Injectable()
export class HealthService {
  /** Una dependencia que tarda más que esto se considera caída. */
  public static readonly PROBE_TIMEOUT_MS: number = 2000;

  private readonly startedAt: Date;

  public constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly probes: ReadinessProbes,
  ) {
    this.startedAt = clock.now();
  }

  public check(): HealthResponse {
    const now: Date = this.clock.now();
    return {
      service: 'api',
      status: ServiceStatus.UP,
      version: this.config.version,
      environment: this.config.environment,
      uptimeSeconds: Math.floor((now.getTime() - this.startedAt.getTime()) / 1000),
      timestamp: now.toISOString(),
    };
  }

  public async readiness(): Promise<ReadinessResponse> {
    const checks: DependencyCheckDto[] = await Promise.all(
      this.probes.probes.map((probe: ReadinessProbe): Promise<DependencyCheckDto> =>
        HealthService.run(probe),
      ),
    );
    const allUp: boolean = checks.every(
      (check: DependencyCheckDto): boolean => check.status === ServiceStatus.UP,
    );
    return {
      status: allUp ? ServiceStatus.UP : ServiceStatus.DOWN,
      checks,
      timestamp: this.clock.now().toISOString(),
    };
  }

  private static async run(probe: ReadinessProbe): Promise<DependencyCheckDto> {
    const startedAt: number = performance.now();
    const deadline: ProbeDeadline = new ProbeDeadline();
    try {
      await Promise.race([probe.check(), deadline.expire(HealthService.PROBE_TIMEOUT_MS)]);
      return HealthService.result(probe, ServiceStatus.UP, startedAt, null);
    } catch (error: unknown) {
      return HealthService.result(
        probe,
        ServiceStatus.DOWN,
        startedAt,
        error instanceof Error ? error.message : 'Error desconocido',
      );
    } finally {
      deadline.cancel();
    }
  }

  private static result(
    probe: ReadinessProbe,
    status: ServiceStatus,
    startedAt: number,
    detail: string | null,
  ): DependencyCheckDto {
    return { name: probe.name(), status, latencyMs: Math.round(performance.now() - startedAt), detail };
  }
}

/** Plazo de una comprobación; se cancela al terminar para no dejar temporizadores vivos. */
class ProbeDeadline {
  private timer: Nullable<NodeJS.Timeout> = null;

  public expire(milliseconds: number): Promise<never> {
    return new Promise<never>((_resolve: (value: never) => void, reject: (reason: Error) => void): void => {
      this.timer = setTimeout(
        (): void => reject(new Error(`Sin respuesta en ${String(milliseconds)} ms`)),
        milliseconds,
      );
    });
  }

  public cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
