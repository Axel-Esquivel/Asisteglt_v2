import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Nullable } from '@asisteglt/shared-kernel';
import { NextFunction, Request, Response } from 'express';
import { CorrelationContext } from '@asisteglt/api-platform';

export const CORRELATION_HEADER = 'x-correlation-id';

/** Propaga o genera el `X-Correlation-Id` y lo deja disponible para logs y errores. */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private static readonly SAFE_ID: RegExp = /^[A-Za-z0-9-]{8,64}$/;

  public use(request: Request, response: Response, next: NextFunction): void {
    const incoming: Nullable<string> = request.header(CORRELATION_HEADER) ?? null;
    const correlationId: string =
      incoming !== null && CorrelationIdMiddleware.SAFE_ID.test(incoming) ? incoming : randomUUID();
    response.setHeader(CORRELATION_HEADER, correlationId);
    CorrelationContext.run(correlationId, (): void => next());
  }
}
