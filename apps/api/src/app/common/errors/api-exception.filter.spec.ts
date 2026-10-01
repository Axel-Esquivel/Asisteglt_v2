import { ApiErrorResponse } from '@asisteglt/shared-contracts';
import { FixedClock, NotFoundError, ValidationError } from '@asisteglt/shared-kernel';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const filter: ApiExceptionFilter = new ApiExceptionFilter(new FixedClock(new Date('2026-10-01T00:00:00Z')));

  it('traduce errores de dominio a su estado HTTP', () => {
    const body: ApiErrorResponse = filter.toResponse(new NotFoundError('PROJECT_NOT_FOUND', 'Proyecto no encontrado'));
    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('PROJECT_NOT_FOUND');
    expect(filter.toResponse(new ValidationError('X', 'mal')).statusCode).toBe(400);
  });

  it('oculta los detalles de errores inesperados', () => {
    const body: ApiErrorResponse = filter.toResponse(new Error('detalle interno secreto'));
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Error interno del servidor');
  });
});
