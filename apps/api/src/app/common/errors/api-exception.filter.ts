import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiErrorResponse, CommonErrorCode } from '@asisteglt/shared-contracts';
import { Clock, DomainError } from '@asisteglt/shared-kernel';
import { Response } from 'express';
import { CorrelationContext } from '@asisteglt/api-platform';

/**
 * Filtro único de la API: traduce `DomainError` a su estado HTTP, respeta los errores HTTP del
 * framework y oculta los detalles de fallos inesperados. Todas las respuestas usan `ApiErrorResponse`.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter<unknown> {
  private readonly logger: Logger = new Logger(ApiExceptionFilter.name);

  public constructor(private readonly clock: Clock) {}

  public catch(error: unknown, host: ArgumentsHost): void {
    const response: Response = host.switchToHttp().getResponse<Response>();
    const body: ApiErrorResponse = this.toResponse(error);
    response.status(body.statusCode).json(body);
  }

  public toResponse(error: unknown): ApiErrorResponse {
    if (error instanceof DomainError) {
      return this.build(error.httpStatus(), error.code, error.message);
    }
    if (error instanceof HttpException) {
      const status: number = error.getStatus();
      const code: string =
        status === HttpStatus.NOT_FOUND ? CommonErrorCode.NOT_FOUND : CommonErrorCode.VALIDATION_FAILED;
      return this.build(status, code, ApiExceptionFilter.messageOf(error));
    }
    this.logger.error(error);
    return this.build(
      HttpStatus.INTERNAL_SERVER_ERROR,
      CommonErrorCode.INTERNAL_ERROR,
      'Error interno del servidor',
    );
  }

  private build(statusCode: number, code: string, message: string): ApiErrorResponse {
    return {
      statusCode,
      code,
      message,
      correlationId: CorrelationContext.current() ?? 'sin-correlacion',
      timestamp: this.clock.now().toISOString(),
    };
  }

  private static messageOf(error: HttpException): string {
    const body: unknown = error.getResponse();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message: unknown = body.message;
      if (Array.isArray(message)) {
        return message.filter((item: unknown): item is string => typeof item === 'string').join('; ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return error.message;
  }
}
