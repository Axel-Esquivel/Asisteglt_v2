import { Injectable } from '@angular/core';
import { Result } from '@asisteglt/shared-kernel';
import { ApiClient } from '../http/api-client';
import { ServiceHealth } from './service-health';
import { ServiceHealthDecoder } from './service-health.decoder';

@Injectable({ providedIn: 'root' })
export class SystemHealthApiClient extends ApiClient {
  private readonly decoder: ServiceHealthDecoder = new ServiceHealthDecoder();

  public check(): Promise<Result<ServiceHealth>> {
    return this.get('health', this.decoder);
  }
}
