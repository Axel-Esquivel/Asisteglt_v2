import { Injectable } from '@nestjs/common';
import { HealthResponse, ServiceStatus } from '@asisteglt/shared-contracts';
import { Clock } from '@asisteglt/shared-kernel';
import { AppConfig } from '../config/app-config';

/** Estado de la API. Las dependencias (MongoDB, Redis) se agregan cuando se conecten en F1. */
@Injectable()
export class HealthService {
  private readonly startedAt: Date;

  public constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
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
}
