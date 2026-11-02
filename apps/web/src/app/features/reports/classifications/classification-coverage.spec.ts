import { ClassificationNodeDto } from '@asisteglt/shared-contracts';
import { ClassifiableValue, ClassifiableValues } from '../data/analysis.model';
import { ClassificationCoverage } from './classification-coverage';

const account = (value: string, name: string, firstPeriod: string): ClassifiableValue =>
  new ClassifiableValue(value, name, firstPeriod, '2026-03', 1);

const values: ClassifiableValues = new ClassifiableValues(
  'f_cuenta',
  '2026-03',
  [
    account('1.001', 'Caja general', '2026-01'),
    account('1.002', 'Bancos ficticios', '2026-01'),
    account('2.001', 'Proveedores', '2026-01'),
    account('9.999', 'Cuenta nueva', '2026-03'),
  ],
  false,
);

const nodes: ClassificationNodeDto[] = [
  { id: 'activo', parentId: null, code: '1', name: 'Activo', patterns: ['1.*'] },
  { id: 'caja', parentId: 'activo', code: '1.1', name: 'Caja', patterns: ['1.001'] },
  { id: 'pasivo', parentId: null, code: '2', name: 'Pasivo', patterns: [] },
];

describe('ClassificationCoverage', () => {
  const coverage: ClassificationCoverage = new ClassificationCoverage(nodes, values);

  it('cuenta lo que captura cada nodo; la cuenta exacta gana al comodín', () => {
    expect(coverage.nodeOf('1.001')).toBe('caja');
    expect(coverage.countOf('activo')).toBe(1);
    expect(coverage.countOf('caja')).toBe(1);
    expect(coverage.countOf('pasivo')).toBe(0);
  });

  it('lista las cuentas sin clasificar y marca las nuevas del último período', () => {
    expect(coverage.unclassified().map((v: ClassifiableValue): string => v.value)).toEqual([
      '2.001',
      '9.999',
    ]);
    expect(coverage.newUnclassified().map((v: ClassifiableValue): string => v.value)).toEqual(['9.999']);
  });

  it('asigna cuentas a un nodo y las quita de los demás', () => {
    const moved: ClassificationNodeDto[] = ClassificationCoverage.assign(nodes, 'pasivo', [
      '1.001 ',
      '2.001',
    ]);
    expect(moved.map((n: ClassificationNodeDto) => n.patterns)).toEqual([['1.*'], [], ['1.001', '2.001']]);
    expect(new ClassificationCoverage(moved, values).unclassified().map((v) => v.value)).toEqual(['9.999']);
  });

  it('busca por código o por nombre con varias palabras', () => {
    expect(values.search('caja', 10).map((v: ClassifiableValue): string => v.value)).toEqual(['1.001']);
    expect(values.search('1.00 banc', 10).map((v: ClassifiableValue): string => v.value)).toEqual(['1.002']);
    expect(values.find('7.777').label).toBe('7.777');
  });

  it('sin períodos anteriores ninguna cuenta se considera nueva', () => {
    const first: ClassifiableValues = new ClassifiableValues(
      'f',
      '2026-01',
      [account('1', 'A', '2026-01')],
      false,
    );
    expect(first.isNew(first.find('1'))).toBe(false);
  });
});
