import { ValidationError } from '../errors/domain-error';
import { Result } from './result';

const codeOf = <T>(result: Result<T>): string =>
  result.match(
    (): string => '',
    (error): string => error.code,
  );

describe('Result', () => {
  it('encadena éxitos', () => {
    const result: Result<number> = Result.ok(2).flatMap((v: number): Result<number> => Result.ok(v + 1));
    expect(result.unwrap()).toBe(3);
  });

  it('propaga el primer fallo', () => {
    const failure: Result<number> = Result.fail<number>(new ValidationError('X', 'mal'));
    const mapped: Result<number> = failure.map((v: number): number => v + 1);
    expect(mapped.isOk()).toBe(false);
    expect(codeOf(mapped)).toBe('X');
  });

  it('unwrap de un fallo lanza el DomainError', () => {
    expect(() => Result.fail<number>(new ValidationError('X', 'mal')).unwrap()).toThrow(ValidationError);
  });

  it('all reúne valores o devuelve el primer fallo', () => {
    expect(Result.all([Result.ok(1), Result.ok(2)]).unwrap()).toEqual([1, 2]);
    const failed: Result<number[]> = Result.all([
      Result.ok(1),
      Result.fail<number>(new ValidationError('E', 'e')),
    ]);
    expect(
      failed.match(
        (): string => 'ok',
        (e): string => e.code,
      ),
    ).toBe('E');
  });
});
