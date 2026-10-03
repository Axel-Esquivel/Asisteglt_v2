import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DependencyCheckDto, ReadinessResponse, ServiceStatus } from '@asisteglt/shared-contracts';
import { FixedClock } from '@asisteglt/shared-kernel';
import { AppConfig, AppConfigLoader } from '../config/app-config';
import { HealthService } from './health.service';
import { ReadinessProbe, ReadinessProbes, StorageReadinessProbe } from './readiness-probes';

class StubProbe extends ReadinessProbe {
  public constructor(
    private readonly label: string,
    private readonly behaviour: () => Promise<void>,
  ) {
    super();
  }

  /** Ejecutor de una promesa que nunca se resuelve (dependencia colgada). */
  public static neverSettles(): void {
    return;
  }

  public name(): string {
    return this.label;
  }

  public check(): Promise<void> {
    return this.behaviour();
  }
}

describe('HealthService.readiness', () => {
  const config: AppConfig = AppConfigLoader.load({
    MONGODB_URI: 'mongodb://localhost:27017/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
  });
  const clock: FixedClock = new FixedClock(new Date('2026-10-01T00:00:00Z'));

  it('queda DOWN si una dependencia falla o no responde a tiempo', async (): Promise<void> => {
    const service: HealthService = new HealthService(
      clock,
      config,
      new ReadinessProbes([
        new StubProbe('ok', (): Promise<void> => Promise.resolve()),
        new StubProbe('caida', (): Promise<void> => Promise.reject(new Error('conexión rechazada'))),
        new StubProbe('lenta', (): Promise<void> => new Promise<void>(StubProbe.neverSettles)),
      ]),
    );
    const readiness: ReadinessResponse = await service.readiness();
    expect(readiness.status).toBe(ServiceStatus.DOWN);
    expect(
      readiness.checks.map((check: DependencyCheckDto): [string, ServiceStatus, string | null] => [
        check.name,
        check.status,
        check.detail,
      ]),
    ).toEqual([
      ['ok', ServiceStatus.UP, null],
      ['caida', ServiceStatus.DOWN, 'conexión rechazada'],
      ['lenta', ServiceStatus.DOWN, `Sin respuesta en ${String(HealthService.PROBE_TIMEOUT_MS)} ms`],
    ]);
  });

  it('comprueba que el directorio de archivos admite escritura', async (): Promise<void> => {
    const service: HealthService = new HealthService(
      clock,
      config,
      new ReadinessProbes([new StorageReadinessProbe(join(tmpdir(), 'asisteglt-readiness'))]),
    );
    expect((await service.readiness()).status).toBe(ServiceStatus.UP);
  });
});
