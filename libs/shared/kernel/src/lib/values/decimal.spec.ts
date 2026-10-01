import { Decimal, RoundingMode } from './decimal';
import { Result } from '../core/result';

const codeOf = <T>(result: Result<T>): string => result.match((): string => '', (error): string => error.code);

const d = (raw: string): Decimal => Decimal.of(raw).unwrap();

describe('Decimal', () => {
  it('suma sin errores de punto flotante', () => {
    expect(d('0.1').add(d('0.2')).toString()).toBe('0.3');
  });

  it('acepta montos con signo y rechaza texto inválido', () => {
    expect(d('-129.64').isNegative()).toBe(true);
    expect(Decimal.of('1,526.50').isOk()).toBe(false);
    expect(codeOf(Decimal.of('abc'))).toBe('INVALID_DECIMAL');
  });

  it('no divide entre cero', () => {
    expect(codeOf(d('10').divide(Decimal.zero()))).toBe('DIVISION_BY_ZERO');
    expect(d('10').divide(d('4')).unwrap().toString()).toBe('2.5');
  });

  it('redondea según el modo', () => {
    expect(d('2.345').round(2, RoundingMode.HALF_UP).toString()).toBe('2.35');
    expect(d('2.345').round(2, RoundingMode.HALF_EVEN).toString()).toBe('2.34');
    expect(d('2.349').round(2, RoundingMode.DOWN).toString()).toBe('2.34');
  });

  it('compara por valor', () => {
    expect(d('1.50').equals(d('1.5'))).toBe(true);
    expect(d('3').compareTo(d('2'))).toBeGreaterThan(0);
    expect(Decimal.fromInteger(1.5).isOk()).toBe(false);
  });
});
