import { Nullable } from '@asisteglt/shared-kernel';

/** Patrón de fecha con `dd`/`d`, `MM`/`M`, `yy`/`yyyy`; los demás caracteres son literales. */
export class DatePattern {
  private constructor(
    private readonly regex: RegExp,
    private readonly order: ReadonlyArray<'d' | 'M' | 'y2' | 'y4'>,
  ) {}

  public static of(pattern: string): DatePattern {
    const order: Array<'d' | 'M' | 'y2' | 'y4'> = [];
    let source: string = '^';
    let rest: string = pattern;
    while (rest.length > 0) {
      const token: Nullable<string> =
        ['yyyy', 'yy', 'dd', 'MM', 'd', 'M'].find((t: string): boolean => rest.startsWith(t)) ?? null;
      if (token === null) {
        source += rest.charAt(0).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        rest = rest.slice(1);
        continue;
      }
      if (token === 'yyyy') {
        source += '(\\d{4})';
        order.push('y4');
      } else if (token === 'yy') {
        source += '(\\d{2})';
        order.push('y2');
      } else if (token === 'dd' || token === 'MM') {
        source += '(\\d{2})';
        order.push(token === 'dd' ? 'd' : 'M');
      } else {
        source += '(\\d{1,2})';
        order.push(token === 'd' ? 'd' : 'M');
      }
      rest = rest.slice(token.length);
    }
    return new DatePattern(new RegExp(`${source}$`), order);
  }

  /** Devuelve `AAAA-MM-DD` o `null` si el texto no cumple el patrón o la fecha no existe. */
  public parse(text: string): Nullable<string> {
    const match: Nullable<RegExpExecArray> = this.regex.exec(text);
    if (match === null) {
      return null;
    }
    let day: number = 0;
    let month: number = 0;
    let year: number = 0;
    this.order.forEach((part: 'd' | 'M' | 'y2' | 'y4', index: number): void => {
      const value: number = Number(match[index + 1] ?? '');
      if (part === 'd') {
        day = value;
      } else if (part === 'M') {
        month = value;
      } else {
        year = part === 'y2' ? 2000 + value : value;
      }
    });
    const date: Date = new Date(Date.UTC(year, month - 1, day));
    const valid: boolean =
      date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return valid ? date.toISOString().slice(0, 10) : null;
  }
}
