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

/** Resultado de una dependencia en `GET /api/v1/health/ready`. */
export interface DependencyCheckDto {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly latencyMs: number;
  readonly detail: string | null;
}

/** Preparación para recibir tráfico: 200 si todas las dependencias responden, 503 si no. */
export interface ReadinessResponse {
  readonly status: ServiceStatus;
  readonly checks: ReadonlyArray<DependencyCheckDto>;
  readonly timestamp: string;
}
