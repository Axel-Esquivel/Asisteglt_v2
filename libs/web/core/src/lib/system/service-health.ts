import { ServiceStatus } from '@asisteglt/shared-contracts';

/** Modelo de vista del estado de un servicio. */
export class ServiceHealth {
  public constructor(
    public readonly service: string,
    public readonly status: ServiceStatus,
    public readonly version: string,
    public readonly environment: string,
    public readonly uptimeSeconds: number,
    public readonly checkedAt: Date,
  ) {}

  public isUp(): boolean {
    return this.status === ServiceStatus.UP;
  }

  public statusLabel(): string {
    switch (this.status) {
      case ServiceStatus.UP:
        return 'Operativo';
      case ServiceStatus.DEGRADED:
        return 'Degradado';
      case ServiceStatus.DOWN:
        return 'Caído';
    }
  }

  public uptimeLabel(): string {
    const hours: number = Math.floor(this.uptimeSeconds / 3600);
    const minutes: number = Math.floor((this.uptimeSeconds % 3600) / 60);
    const seconds: number = this.uptimeSeconds % 60;
    return hours > 0
      ? `${String(hours)} h ${String(minutes)} min`
      : `${String(minutes)} min ${String(seconds)} s`;
  }
}
