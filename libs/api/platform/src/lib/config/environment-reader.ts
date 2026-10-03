import { Nullable } from '@asisteglt/shared-kernel';

export type EnvironmentSource = NodeJS.ProcessEnv;

/** Error de configuración: lista todas las variables inválidas de una vez. */
export class ConfigurationError extends Error {
  public constructor(public readonly problems: ReadonlyArray<string>) {
    super(`Configuración inválida:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigurationError';
  }
}

/**
 * Lee variables de entorno validándolas y acumulando los problemas; nunca devuelve `undefined`.
 * Uso: leer todas las variables y luego llamar `assertValid()`.
 */
export class EnvironmentReader {
  private readonly problems: string[] = [];

  public constructor(private readonly source: EnvironmentSource) {}

  public text(name: string, fallback: string): string {
    return this.raw(name) ?? fallback;
  }

  public port(name: string, fallback: number): number {
    const value: Nullable<string> = this.raw(name);
    if (value === null) {
      return fallback;
    }
    const parsed: number = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      this.problems.push(`${name} debe ser un puerto entre 1 y 65535 (recibido «${value}»)`);
      return fallback;
    }
    return parsed;
  }

  public positiveInteger(name: string, fallback: number): number {
    const value: Nullable<string> = this.raw(name);
    if (value === null) {
      return fallback;
    }
    const parsed: number = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      this.problems.push(`${name} debe ser un entero positivo (recibido «${value}»)`);
      return fallback;
    }
    return parsed;
  }

  public list(name: string, fallback: ReadonlyArray<string>): ReadonlyArray<string> {
    const value: Nullable<string> = this.raw(name);
    return value === null
      ? fallback
      : value
          .split(',')
          .map((item: string): string => item.trim())
          .filter((item: string): boolean => item.length > 0);
  }

  public enumValue<T extends string>(name: string, allowed: ReadonlyArray<T>, fallback: T): T {
    const value: Nullable<string> = this.raw(name);
    if (value === null) {
      return fallback;
    }
    const match: Nullable<T> = allowed.find((candidate: T): boolean => candidate === value) ?? null;
    if (match === null) {
      this.problems.push(`${name} debe ser uno de: ${allowed.join(', ')} (recibido «${value}»)`);
      return fallback;
    }
    return match;
  }

  public requiredUrl(name: string, protocols: ReadonlyArray<string>): string {
    const value: Nullable<string> = this.raw(name);
    if (value === null) {
      this.problems.push(`${name} es obligatoria`);
      return '';
    }
    if (!protocols.some((protocol: string): boolean => value.startsWith(`${protocol}//`))) {
      this.problems.push(`${name} debe usar ${protocols.join(' o ')}`);
    }
    return value;
  }

  public secret(name: string, minLength: number): string {
    const value: Nullable<string> = this.raw(name);
    if (value === null || value.length < minLength) {
      this.problems.push(`${name} es obligatoria y debe tener al menos ${String(minLength)} caracteres`);
      return '';
    }
    return value;
  }

  /** Secreto opcional: cadena vacía si no está definido; si lo está, exige la longitud mínima. */
  public optionalSecret(name: string, minLength: number): string {
    const value: Nullable<string> = this.raw(name);
    if (value === null) {
      return '';
    }
    if (value.length < minLength) {
      this.problems.push(`${name} debe tener al menos ${String(minLength)} caracteres`);
      return '';
    }
    return value;
  }

  public assertValid(): void {
    if (this.problems.length > 0) {
      throw new ConfigurationError(this.problems);
    }
  }

  private raw(name: string): Nullable<string> {
    const value: Nullable<string> = this.source[name] ?? null;
    return value === null || value.trim() === '' ? null : value.trim();
  }
}
