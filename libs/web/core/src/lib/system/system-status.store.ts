import { Injectable, Signal, inject } from '@angular/core';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { BaseStore } from '../state/base-store';
import { ServiceHealth } from './service-health';
import { SystemHealthApiClient } from './system-health.api-client';

export enum LoadStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  FAILED = 'FAILED',
}

interface SystemStatusState {
  readonly status: LoadStatus;
  readonly health: Nullable<ServiceHealth>;
  readonly errorMessage: Nullable<string>;
}

/** Estado de los servicios del backend que se muestra en el inicio. */
@Injectable({ providedIn: 'root' })
export class SystemStatusStore extends BaseStore<SystemStatusState> {
  public readonly status: Signal<LoadStatus> = this.select((s: SystemStatusState): LoadStatus => s.status);
  public readonly health: Signal<Nullable<ServiceHealth>> = this.select(
    (s: SystemStatusState): Nullable<ServiceHealth> => s.health,
  );
  public readonly errorMessage: Signal<Nullable<string>> = this.select(
    (s: SystemStatusState): Nullable<string> => s.errorMessage,
  );

  private readonly api: SystemHealthApiClient = inject(SystemHealthApiClient);

  public constructor() {
    super({ status: LoadStatus.IDLE, health: null, errorMessage: null });
  }

  public async refresh(): Promise<void> {
    this.update((current: SystemStatusState): SystemStatusState => ({ ...current, status: LoadStatus.LOADING }));
    const result: Result<ServiceHealth> = await this.api.check();
    this.update(
      (current: SystemStatusState): SystemStatusState =>
        result.match(
          (health: ServiceHealth): SystemStatusState => ({ status: LoadStatus.LOADED, health, errorMessage: null }),
          (error): SystemStatusState => ({ ...current, status: LoadStatus.FAILED, errorMessage: error.message }),
        ),
    );
  }
}
