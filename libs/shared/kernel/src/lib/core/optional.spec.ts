import { Optional } from './optional';

describe('Optional', () => {
  it('devuelve el valor presente', () => {
    expect(Optional.of(5).map((v: number): number => v * 2).orElse(0)).toBe(10);
  });

  it('usa el valor por defecto cuando está vacío', () => {
    expect(Optional.empty<number>().map((v: number): number => v * 2).orElse(7)).toBe(7);
  });

  it('convierte null en vacío', () => {
    expect(Optional.fromNullable<string>(null).isPresent()).toBe(false);
    expect(Optional.fromNullable('a').toNullable()).toBe('a');
  });

  it('lanza el error indicado cuando está vacío', () => {
    expect(() => Optional.empty<string>().orElseThrow((): Error => new Error('falta'))).toThrow('falta');
  });

  it('filtra valores', () => {
    expect(Optional.of(3).filter((v: number): boolean => v > 5).isPresent()).toBe(false);
  });
});
