import { ConfigurationError, EnvironmentReader } from './config/environment-reader';
import { LogLevel } from './config/runtime';
import { CorrelationContext } from './correlation/correlation-context';
import { JsonLogger } from './logging/json-logger';

describe('EnvironmentReader', () => {
  it('acumula problemas y los informa juntos', () => {
    const reader: EnvironmentReader = new EnvironmentReader({ PORT: '0', LEVEL: 'x' });
    reader.port('PORT', 3000);
    reader.enumValue('LEVEL', Object.values(LogLevel), LogLevel.INFO);
    reader.requiredUrl('REDIS_URL', ['redis:']);
    expect(() => reader.assertValid()).toThrow(ConfigurationError);
  });

  it('usa valores por defecto con variables vacías', () => {
    const reader: EnvironmentReader = new EnvironmentReader({ NAME: '   ' });
    expect(reader.text('NAME', 'por-defecto')).toBe('por-defecto');
    expect(reader.positiveInteger('N', 5)).toBe(5);
  });
});

describe('JsonLogger', () => {
  it('escribe una línea JSON con correlación y respeta el nivel mínimo', () => {
    const lines: string[] = [];
    const logger: JsonLogger = new JsonLogger(LogLevel.INFO, (line: string): void => {
      lines.push(line);
    });
    CorrelationContext.run('corr-123456', (): void => {
      logger.debug('oculto');
      logger.log('visible', 'Contexto');
    });
    expect(lines).toHaveLength(1);
    const entry: unknown = JSON.parse(lines[0] ?? '{}');
    expect(entry).toMatchObject({
      level: 'info',
      message: 'visible',
      context: 'Contexto',
      correlationId: 'corr-123456',
    });
  });
});
