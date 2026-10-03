import { CorrelationIdMiddleware } from './correlation-id.middleware';

describe('CorrelationIdMiddleware.resolve', () => {
  const trace: string = '4bf92f3577b34da6a3ce929d0e0e4736';

  it('prefiere X-Correlation-Id, luego X-Request-Id y luego el trace-id de traceparent', (): void => {
    expect(CorrelationIdMiddleware.resolve('correlacion-1', 'peticion-1', null)).toBe('correlacion-1');
    expect(CorrelationIdMiddleware.resolve(null, 'peticion-1', null)).toBe('peticion-1');
    expect(CorrelationIdMiddleware.resolve(null, null, `00-${trace}-00f067aa0ba902b7-01`)).toBe(trace);
  });

  it('descarta valores inseguros o vacíos y genera uno nuevo', (): void => {
    const generated: string = CorrelationIdMiddleware.resolve(
      '<script>',
      'x',
      `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`,
    );
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    expect(CorrelationIdMiddleware.resolve(null, null, 'no-es-traceparent')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
