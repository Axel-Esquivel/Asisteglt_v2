import { Collections } from './collections';
import { ReadonlyDictionary } from './readonly-dictionary';

describe('Collections y ReadonlyDictionary', () => {
  it('busca sin devolver undefined', () => {
    expect(Collections.findFirst([1, 2, 3], (v: number): boolean => v > 1).orElse(0)).toBe(2);
    expect(Collections.findFirst([1], (v: number): boolean => v > 5).isPresent()).toBe(false);
    expect(Collections.at(['a'], 3).isPresent()).toBe(false);
    expect(Collections.last(['a', 'b']).orElse('')).toBe('b');
  });

  it('consulta un diccionario de forma segura', () => {
    const dict: ReadonlyDictionary<string, number> = ReadonlyDictionary.from<string, number>([['a', 1]]);
    expect(dict.get('a').orElse(0)).toBe(1);
    expect(dict.get('z').isPresent()).toBe(false);
    expect(dict.with('b', 2).size()).toBe(2);
    expect(dict.size()).toBe(1);
  });
});
