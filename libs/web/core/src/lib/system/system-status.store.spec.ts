import { TestBed } from '@angular/core/testing';
import { ServiceStatus } from '@asisteglt/shared-contracts';
import { Result } from '@asisteglt/shared-kernel';
import { ApiRequestError } from '../http/api-request-error';
import { ServiceHealth } from './service-health';
import { SystemHealthApiClient } from './system-health.api-client';
import { LoadStatus, SystemStatusStore } from './system-status.store';

class FakeHealthClient {
  public constructor(private readonly response: Result<ServiceHealth>) {}

  public check(): Promise<Result<ServiceHealth>> {
    return Promise.resolve(this.response);
  }
}

const storeWith = (response: Result<ServiceHealth>): SystemStatusStore => {
  TestBed.configureTestingModule({
    providers: [{ provide: SystemHealthApiClient, useValue: new FakeHealthClient(response) }],
  });
  return TestBed.inject(SystemStatusStore);
};

describe('SystemStatusStore', () => {
  it('carga el estado del servicio', async (): Promise<void> => {
    const health: ServiceHealth = new ServiceHealth('api', ServiceStatus.UP, '0.1.0', 'test', 10, new Date());
    const store: SystemStatusStore = storeWith(Result.ok(health));
    expect(store.status()).toBe(LoadStatus.IDLE);
    await store.refresh();
    expect(store.status()).toBe(LoadStatus.LOADED);
    expect(store.health()).toBe(health);
  });

  it('expone el mensaje de error cuando la API falla', async (): Promise<void> => {
    const store: SystemStatusStore = storeWith(
      Result.fail(new ApiRequestError('API_UNREACHABLE', 'No se pudo conectar con el servidor', 0)),
    );
    await store.refresh();
    expect(store.status()).toBe(LoadStatus.FAILED);
    expect(store.errorMessage()).toBe('No se pudo conectar con el servidor');
  });
});
