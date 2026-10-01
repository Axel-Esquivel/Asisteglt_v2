/** Configuración del cliente HTTP (se provee en `provideAsisteGltCore`). */
export class ApiConfig {
  public constructor(public readonly baseUrl: string) {}

  public url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }
}
