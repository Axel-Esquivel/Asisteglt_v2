import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import type { HealthResponse, ReadinessResponse } from '@asisteglt/shared-contracts';
import { ServiceStatus } from '@asisteglt/shared-contracts';
import { Public } from '../common/auth/auth.decorators';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  public constructor(private readonly health: HealthService) {}

  /** Vida: el proceso responde (para reiniciarlo si deja de hacerlo). */
  @Get()
  public check(): HealthResponse {
    return this.health.check();
  }

  /** Preparación: 503 mientras alguna dependencia no responda (para sacarla del balanceo). */
  @Get('ready')
  public async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const readiness: ReadinessResponse = await this.health.readiness();
    response.status(readiness.status === ServiceStatus.UP ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return readiness;
  }
}
