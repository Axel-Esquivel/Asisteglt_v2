import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Header, NotFoundException, Req } from '@nestjs/common';
import { Request } from 'express';
import { MetricsRegistry } from '@asisteglt/api-platform';
import { Nullable } from '@asisteglt/shared-kernel';
import { Public } from '../auth/auth.decorators';
import { AppConfig } from '../../config/app-config';

/**
 * Métricas en formato Prometheus. Requiere `Authorization: Bearer <METRICS_TOKEN>`; sin token
 * configurado o con uno incorrecto responde 404 para no revelar el endpoint.
 */
@Public()
@Controller('metrics')
export class MetricsController {
  public constructor(
    private readonly metrics: MetricsRegistry,
    private readonly config: AppConfig,
  ) {}

  @Get()
  @Header('Content-Type', MetricsRegistry.CONTENT_TYPE)
  @Header('Cache-Control', 'no-store')
  public expose(@Req() request: Request): string {
    if (!this.authorized(request.header('authorization') ?? null)) {
      throw new NotFoundException('Recurso no encontrado');
    }
    return this.metrics.render();
  }

  private authorized(header: Nullable<string>): boolean {
    const expected: string = this.config.metricsToken;
    if (expected === '' || header === null) {
      return false;
    }
    const presented: Buffer = Buffer.from(header.replace(/^Bearer\s+/i, ''));
    const wanted: Buffer = Buffer.from(expected);
    return presented.length === wanted.length && timingSafeEqual(presented, wanted);
  }
}
