import { ServiceStatus } from '@asisteglt/shared-contracts';
import { Result } from '@asisteglt/shared-kernel';
import { ServiceHealth } from './service-health';
import { ServiceHealthDecoder } from './service-health.decoder';

const decoder: ServiceHealthDecoder = new ServiceHealthDecoder();
const codeOf = <T>(result: Result<T>): string => result.match((): string => '', (error): string => error.code);

describe('ServiceHealthDecoder', () => {
  it('decodifica una respuesta válida', () => {
    const health: ServiceHealth = decoder
      .decode({
        service: 'api',
        status: 'UP',
        version: '0.1.0',
        environment: 'development',
        uptimeSeconds: 3725,
        timestamp: '2026-10-01T12:00:00.000Z',
      })
      .unwrap();
    expect(health.isUp()).toBe(true);
    expect(health.status).toBe(ServiceStatus.UP);
    expect(health.statusLabel()).toBe('Operativo');
    expect(health.uptimeLabel()).toBe('1 h 2 min');
  });

  it('rechaza respuestas mal formadas sin lanzar', () => {
    expect(codeOf(decoder.decode('texto'))).toBe('INVALID_JSON_OBJECT');
    expect(codeOf(decoder.decode({ service: 'api', status: 'RARO' }))).toBe('INVALID_JSON_FIELD');
    expect(
      codeOf(
        decoder.decode({
          service: 'api',
          status: 'UP',
          version: '1',
          environment: 'x',
          uptimeSeconds: 1,
          timestamp: 'no-es-fecha',
        }),
      ),
    ).toBe('INVALID_JSON_FIELD');
  });
});
