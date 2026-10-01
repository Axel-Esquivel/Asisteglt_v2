import { Nullable } from '@asisteglt/shared-kernel';

/** Lee cookies del encabezado `Cookie` con tipos seguros. */
export class CookieJar {
  private constructor(private readonly values: ReadonlyMap<string, string>) {}

  public static parse(header: Nullable<string>): CookieJar {
    const values: Map<string, string> = new Map<string, string>();
    if (header !== null) {
      for (const part of header.split(';')) {
        const index: number = part.indexOf('=');
        if (index > 0) {
          const name: string = part.slice(0, index).trim();
          const raw: string = part.slice(index + 1).trim();
          try {
            values.set(name, decodeURIComponent(raw));
          } catch {
            values.set(name, raw);
          }
        }
      }
    }
    return new CookieJar(values);
  }

  public get(name: string): Nullable<string> {
    return this.values.get(name) ?? null;
  }
}
