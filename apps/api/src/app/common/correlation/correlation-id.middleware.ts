import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Nullable } from '@asisteglt/shared-kernel';
import { NextFunction, Request, Response } from 'express';
import { CorrelationContext } from '@asisteglt/api-platform';

export const CORRELATION_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';
export const TRACEPARENT_HEADER = 'traceparent';

/**
 * Propaga o genera el identificador de correlación y lo deja disponible para logs y errores. Se
 * toma, en orden, de `X-Correlation-Id`, `X-Request-Id` (lo pone nginx) o el *trace-id* de un
 * `traceparent` W3C; si ninguno es válido se genera uno. Se devuelve en ambas cabeceras.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private static readonly SAFE_ID: RegExp = /^[A-Za-z0-9-]{8,64}$/;
  private static readonly TRACEPARENT: RegExp = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;
  private static readonly EMPTY_TRACE: string = '0'.repeat(32);

  public use(request: Request, response: Response, next: NextFunction): void {
    const correlationId: string = CorrelationIdMiddleware.resolve(
      request.header(CORRELATION_HEADER) ?? null,
      request.header(REQUEST_ID_HEADER) ?? null,
      request.header(TRACEPARENT_HEADER) ?? null,
    );
    response.setHeader(CORRELATION_HEADER, correlationId);
    response.setHeader(REQUEST_ID_HEADER, correlationId);
    CorrelationContext.run(correlationId, (): void => next());
  }

  public static resolve(
    correlation: Nullable<string>,
    requestId: Nullable<string>,
    traceparent: Nullable<string>,
  ): string {
    for (const candidate of [correlation, requestId]) {
      if (candidate !== null && CorrelationIdMiddleware.SAFE_ID.test(candidate)) {
        return candidate;
      }
    }
    const match: Nullable<RegExpExecArray> =
      traceparent === null ? null : CorrelationIdMiddleware.TRACEPARENT.exec(traceparent.trim());
    const trace: Nullable<string> = match === null ? null : (match[1] ?? null);
    return trace !== null && trace !== CorrelationIdMiddleware.EMPTY_TRACE ? trace : randomUUID();
  }
}
