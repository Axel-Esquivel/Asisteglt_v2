import { Period } from './period';
import { Result } from '../core/result';

const codeOf = <T>(result: Result<T>): string =>
  result.match(
    (): string => '',
    (error): string => error.code,
  );

const p = (year: number, month: number): Period => Period.of(year, month).unwrap();

describe('Period', () => {
  it('valida mes y año', () => {
    expect(codeOf(Period.of(2026, 13))).toBe('PERIOD_INVALID_MONTH');
    expect(codeOf(Period.of(1800, 1))).toBe('PERIOD_INVALID_YEAR');
  });

  it('calcula el período anterior y siguiente cruzando el año', () => {
    expect(p(2026, 1).previous().toString()).toBe('2025-12');
    expect(p(2026, 12).next().toString()).toBe('2027-01');
  });

  it('calcula el inicio del ejercicio fiscal', () => {
    expect(p(2026, 8).startOfFiscalYear(1).unwrap().toString()).toBe('2026-01');
    expect(p(2026, 3).startOfFiscalYear(7).unwrap().toString()).toBe('2025-07');
  });

  it('genera rangos inclusivos', () => {
    expect(
      p(2025, 11)
        .rangeTo(p(2026, 2))
        .map((x: Period): string => x.toString()),
    ).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(p(2026, 2).rangeTo(p(2025, 1))).toEqual([]);
  });
});
