import { DataType, EmptyHandling, FieldRole, NumericNature } from '@asisteglt/shared-contracts';
import { Result } from '@asisteglt/shared-kernel';
import { CellValue } from './cell-value';
import { ColumnDefaults, ColumnSpec } from './column-spec';
import { ValueParser } from './value-parser';

describe('ValueParser', () => {
  const parse = (column: ColumnSpec, raw: string): Result<CellValue> =>
    new ValueParser(column, 'Campo').parse(raw);
  const decimal: ColumnSpec = ColumnDefaults.create(
    0,
    'f',
    FieldRole.DATA,
    DataType.DECIMAL,
    NumericNature.AMOUNT,
  );

  it('lee formatos numéricos y negativos', () => {
    expect(parse(decimal, '  1,300.50').unwrap()).toBe('1300.5');
    expect(parse(decimal, '.00').unwrap()).toBe('0');
    expect(parse(decimal, '450.00-').unwrap()).toBe('-450');
    expect(parse(decimal, '(12.5)').unwrap()).toBe('-12.5');
    expect(parse(decimal, '75.00CR').unwrap()).toBe('-75');
    expect(parse({ ...decimal, thousandsSeparator: '.', decimalSeparator: ',' }, '1.300,25').unwrap()).toBe(
      '1300.25',
    );
    expect(parse(decimal, '1.300,00').isOk()).toBe(false);
  });

  it('aplica la regla de vacíos según rol y naturaleza', () => {
    expect(parse(decimal, '   ').unwrap()).toBe('0');
    expect(parse({ ...decimal, emptyHandling: EmptyHandling.NO_VALUE }, '').unwrap()).toBeNull();
    const rate: ColumnSpec = ColumnDefaults.create(
      0,
      'f',
      FieldRole.DATA,
      DataType.DECIMAL,
      NumericNature.RATE,
    );
    expect(parse(rate, '').unwrap()).toBeNull();
    const id: ColumnSpec = ColumnDefaults.create(0, 'f', FieldRole.IDENTIFIER, DataType.TEXT, null);
    expect(parse(id, '').isOk()).toBe(false);
  });

  it('lee enteros, fechas y sí/no', () => {
    const integer: ColumnSpec = ColumnDefaults.create(
      0,
      'f',
      FieldRole.DATA,
      DataType.INTEGER,
      NumericNature.QUANTITY,
    );
    expect(parse(integer, '1,250').unwrap()).toBe('1250');
    expect(parse(integer, '2.5').isOk()).toBe(false);
    const date: ColumnSpec = {
      ...ColumnDefaults.create(0, 'f', FieldRole.DATA, DataType.DATE, null),
      datePattern: 'dd/MM/yy',
    };
    expect(parse(date, '05/03/26').unwrap()).toBe('2026-03-05');
    expect(parse(date, '31/02/26').isOk()).toBe(false);
    const flag: ColumnSpec = ColumnDefaults.create(0, 'f', FieldRole.DATA, DataType.BOOLEAN, null);
    expect(parse(flag, 's').unwrap()).toBe(true);
    expect(parse(flag, 'N').unwrap()).toBe(false);
    expect(parse(flag, 'T').isOk()).toBe(false);
  });
});
