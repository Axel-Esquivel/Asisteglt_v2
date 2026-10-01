/** Estado de un servicio expuesto por `GET /api/v1/health`. */
export enum ServiceStatus {
  UP = 'UP',
  DEGRADED = 'DEGRADED',
  DOWN = 'DOWN',
}

export interface HealthResponse {
  readonly service: string;
  readonly status: ServiceStatus;
  readonly version: string;
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
}
