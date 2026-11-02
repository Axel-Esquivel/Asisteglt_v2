import { PatternClassifier, WildcardPattern } from './wildcard-pattern';

describe('WildcardPattern', () => {
  it('reconoce comodines y valores exactos sin distinguir mayúsculas', () => {
    expect(new WildcardPattern('1.*').matches('1.001')).toBe(true);
    expect(new WildcardPattern('1.00?').matches('1.001')).toBe(true);
    expect(new WildcardPattern('1.00?').matches('1.0011')).toBe(false);
    expect(new WildcardPattern(' Caja ').matches('CAJA')).toBe(true);
    expect(WildcardPattern.isExact('1.001.002')).toBe(true);
    expect(WildcardPattern.isExact('1.*')).toBe(false);
  });

  it('a igual cantidad de literales, el valor exacto es más específico', () => {
    expect(new WildcardPattern('1101').compareSpecificity(new WildcardPattern('1101*'))).toBeGreaterThan(0);
    expect(new WildcardPattern('1.*').compareSpecificity(new WildcardPattern('1.001.*'))).toBeLessThan(0);
  });
});

describe('PatternClassifier', () => {
  const classifier: PatternClassifier = new PatternClassifier([
    { key: 'activo', patterns: ['1*'] },
    { key: 'caja', patterns: ['1.001.*', '1.009.050'] },
    { key: 'otra', patterns: ['1.009.050', '1.001.*'] },
  ]);

  it('el patrón más específico gana y a igualdad gana el primero', () => {
    expect(classifier.classify('1.002.001')).toBe('activo');
    expect(classifier.classify('1.001.001')).toBe('caja');
    expect(classifier.classify('1.009.050')).toBe('caja');
    expect(classifier.classify('2.001')).toBeNull();
  });

  it('una cuenta exacta gana sobre cualquier comodín', () => {
    const exact: PatternClassifier = new PatternClassifier([
      { key: 'grupo', patterns: ['1.001.00*'] },
      { key: 'suelta', patterns: ['1.001.001'] },
    ]);
    expect(exact.classify(' 1.001.001 ')).toBe('suelta');
    expect(exact.classify('1.001.002')).toBe('grupo');
  });
});
