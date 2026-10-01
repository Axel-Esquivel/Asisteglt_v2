import { Result } from '../core/result';
import { FieldDecoder, FieldReader } from './field-reader';

class Sample {
  public constructor(
    public readonly name: string,
    public readonly tags: string[],
    public readonly limit: number | null,
  ) {}
}

describe('FieldReader', () => {
  const decoder: FieldDecoder<Sample> = new FieldDecoder<Sample>(
    (f: FieldReader): Sample => new Sample(f.string('name'), f.stringList('tags'), f.nullableNumber('limit')),
  );

  it('decodifica un objeto válido', () => {
    const result: Result<Sample> = decoder.decode({ name: 'a', tags: ['x'], limit: null });
    expect(result.unwrap()).toEqual(new Sample('a', ['x'], null));
  });

  it('devuelve un fallo cuando un campo no tiene el tipo esperado', () => {
    const result: Result<Sample> = decoder.decode({ name: 'a', tags: [1], limit: 2 });
    expect(result.isOk()).toBe(false);
    expect(decoder.decode('texto').isOk()).toBe(false);
  });
});
