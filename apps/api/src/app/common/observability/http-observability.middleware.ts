import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Counter, Histogram, MetricsRegistry } from '@asisteglt/api-platform';

/**
 * Mide cada petición HTTP (contador y latencia por ruta) y escribe una línea de acceso en el log
 * JSON. La ruta es la plantilla de Express (`/api/v1/projects/:projectId`), nunca la URL con ids,
 * para que las series tengan baja cardinalidad y no expongan datos.
 */
@Injectable()
export class HttpObservabilityMiddleware implements NestMiddleware {
  private static readonly QUIET_ROUTES: ReadonlySet<string> = new Set<string>([
    '/api/v1/health',
    '/api/v1/health/ready',
    '/api/v1/metrics',
  ]);

  private static readonly UNMATCHED: string = 'sin-ruta';

  private readonly logger: Logger = new Logger('HttpAccess');
  private readonly requests: Counter;
  private readonly latency: Histogram;

  public constructor(metrics: MetricsRegistry) {
    this.requests = metrics.counter('asisteglt_http_requests_total', 'Peticiones HTTP atendidas');
    this.latency = metrics.histogram(
      'asisteglt_http_request_duration_seconds',
      'Duración de las peticiones HTTP',
      MetricsRegistry.LATENCY_BUCKETS,
    );
  }

  public use(request: Request, response: Response, next: NextFunction): void {
    const startedAt: bigint = process.hrtime.bigint();
    response.on('finish', (): void => {
      const seconds: number = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const route: string = HttpObservabilityMiddleware.routeOf(request);
      const status: string = String(response.statusCode);
      this.requests.inc({ method: request.method, route, status });
      this.latency.observe({ method: request.method, route }, seconds);
      if (HttpObservabilityMiddleware.QUIET_ROUTES.has(route) && response.statusCode < 400) {
        return;
      }
      const line: Readonly<Record<string, string | number>> = {
        method: request.method,
        route,
        status: response.statusCode,
        durationMs: Math.round(seconds * 1000),
      };
      if (response.statusCode >= 500) {
        this.logger.error(line);
      } else {
        this.logger.log(line);
      }
    });
    next();
  }

  /**
   * Plantilla de la ruta atendida, o `sin-ruta` si ninguna coincidió (incluida la ruta comodín con
   * la que Nest responde 404).
   */
  public static routeOf(request: Request): string {
    const route: unknown = request.route;
    if (typeof route === 'object' && route !== null && 'path' in route && typeof route.path === 'string') {
      const template: string = `${request.baseUrl}${route.path}`;
      return template.includes('*') ? HttpObservabilityMiddleware.UNMATCHED : template;
    }
    return HttpObservabilityMiddleware.UNMATCHED;
  }
}
