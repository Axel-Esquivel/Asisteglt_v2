import { Aggregation, DataType, NumericNature } from '@asisteglt/shared-contracts';
import { Decimal, Nullable, Result } from '@asisteglt/shared-kernel';
import { AggregateRequest, AggregateRequestCollector } from './aggregate-requests';
import { CompiledFormula, FormulaCompiler, FormulaFormatter } from './compiler';
import { EvaluationContext, Evaluator, FormulaValue, RecordContext } from './evaluator';
import { FieldInfo, ListFieldResolver } from './field-resolver';
import { FormulaContext } from './type-checker';

/** Catálogo FICTICIO con los ejemplos de docs/12 §2.4. */
const amount = (key: string, label: string): FieldInfo =>
  new FieldInfo(key, label, DataType.DECIMAL, NumericNature.AMOUNT, Aggregation.SUM, null, true);
const FIELDS: FieldInfo[] = [
  amount('f_prev', 'Saldo anterior'),
  amount('f_debe', 'Debe'),
  amount('f_haber', 'Haber'),
  amount('f_venta', 'Monto de venta'),
  new FieldInfo(
    'f_unid',
    'Unidades vendidas',
    DataType.INTEGER,
    NumericNature.QUANTITY,
    Aggregation.SUM,
    null,
    true,
  ),
  new FieldInfo(
    'f_desc',
    '% de descuento',
    DataType.DECIMAL,
    NumericNature.RATE,
    Aggregation.WEIGHTED_AVERAGE,
    'f_venta',
    true,
  ),
  new FieldInfo(
    'f_precio',
    'Precio unitario',
    DataType.DECIMAL,
    NumericNature.UNIT_PRICE,
    Aggregation.WEIGHTED_AVERAGE,
    'f_unid',
    true,
  ),
  new FieldInfo('f_vend', 'Vendedor', DataType.TEXT, null, Aggregation.NONE, null, true),
  new FieldInfo('f_old', 'Viejo', DataType.DECIMAL, NumericNature.AMOUNT, Aggregation.SUM, null, false),
];

describe('Motor de fórmulas', () => {
  const resolver: ListFieldResolver = new ListFieldResolver(FIELDS);
  const compiler: FormulaCompiler = new FormulaCompiler();
  const compile = (source: string, context: FormulaContext): Result<CompiledFormula> =>
    compiler.compile(source, resolver, context);
  const message = (result: Result<CompiledFormula>): string => {
    const error = result.errorOrNull();
    return error === null ? '' : error.message;
  };

  it('guarda en forma canónica y muestra el nombre vigente tras renombrar', () => {
    const formula: CompiledFormula = compile('=[debe] - [Haber]', FormulaContext.RECORD).unwrap();
    expect(formula.canonicalSource).toBe('=[#f_debe] - [#f_haber]');
    expect(formula.resultType.describe()).toBe('Monto');
    expect(formula.fieldDependencies).toEqual(['f_debe', 'f_haber']);
    const renamed: ListFieldResolver = new ListFieldResolver(
      FIELDS.map((f: FieldInfo): FieldInfo =>
        f.key === 'f_debe'
          ? new FieldInfo(f.key, 'Cargos', f.dataType, f.nature, f.aggregation, f.weightKey, true)
          : f,
      ),
    );
    expect(new FormulaFormatter().format(formula.canonicalSource, renamed)).toBe('=[Cargos] - [Haber]');
    expect(compile(formula.canonicalSource, FormulaContext.RECORD).unwrap().canonicalSource).toBe(
      formula.canonicalSource,
    );
  });

  it('deduce la naturaleza del resultado', () => {
    expect(
      compile('=[Monto de venta] / [Unidades vendidas]', FormulaContext.RECORD)
        .unwrap()
        .resultType.describe(),
    ).toBe('Precio unitario');
    expect(
      compile('=[Unidades vendidas] * [Precio unitario]', FormulaContext.RECORD)
        .unwrap()
        .resultType.describe(),
    ).toBe('Monto');
    expect(compile('=[Debe] / [Haber]', FormulaContext.RECORD).unwrap().resultType.describe()).toBe('Tasa');
    expect(compile('=[Debe] * 1.12', FormulaContext.RECORD).unwrap().resultType.describe()).toBe('Monto');
    expect(
      compile('=PROMEDIO.PONDERADO([% de descuento]; [Monto de venta])', FormulaContext.AGGREGATE)
        .unwrap()
        .resultType.describe(),
    ).toBe('Tasa');
  });

  it('rechaza operaciones sin sentido con mensajes claros', () => {
    expect(message(compile('=[Vendedor] + [Monto de venta]', FormulaContext.RECORD))).toBe(
      'No se puede sumar Texto con Número decimal',
    );
    expect(message(compile('=SUMA([% de descuento])', FormulaContext.AGGREGATE))).toBe(
      'Una tasa no se puede sumar; use PROMEDIO.PONDERADO',
    );
    expect(message(compile('=[Unidades vendidas] + [Monto de venta]', FormulaContext.RECORD))).toBe(
      'No se puede sumar Cantidad con Monto',
    );
    expect(message(compile('=[Debitos] * 2', FormulaContext.RECORD))).toBe(
      'No existe el encabezado [Debitos]',
    );
    expect(message(compile('=[Viejo] * 2', FormulaContext.RECORD))).toContain('está desactivado');
    expect(message(compile('=SUMA([Debe])', FormulaContext.RECORD))).toBe(
      'SUMA no se permite en un cálculo por registro',
    );
    expect(compile('=[Debe] +', FormulaContext.RECORD).isOk()).toBe(false);
    expect(compile('=FOO([Debe])', FormulaContext.RECORD).isOk()).toBe(false);
  });

  it('evalúa por registro con Decimal y propaga vacíos', () => {
    const formula: CompiledFormula = compile(
      '=[Saldo anterior] + [Debe] - [Haber]',
      FormulaContext.RECORD,
    ).unwrap();
    const value = (values: Record<string, string | null>): FormulaValue =>
      new Evaluator(resolver, new RecordContext(values)).evaluate(formula.root);
    expect(String(value({ f_prev: '0.1', f_debe: '0.2', f_haber: '0' }))).toBe('0.3');
    expect(value({ f_prev: '1', f_debe: null, f_haber: '0' })).toBeNull();
    const ratio: CompiledFormula = compile(
      '=SI([Haber] = 0; 0; [Debe] / [Haber])',
      FormulaContext.RECORD,
    ).unwrap();
    expect(
      String(new Evaluator(resolver, new RecordContext({ f_debe: '5', f_haber: '0' })).evaluate(ratio.root)),
    ).toBe('0');
    expect(
      String(new Evaluator(resolver, new RecordContext({ f_debe: '5', f_haber: '2' })).evaluate(ratio.root)),
    ).toBe('2.5');
  });

  it('evalúa agregados pidiendo a su contexto la agregación de cada encabezado', () => {
    class Sums extends EvaluationContext {
      public override kind(): FormulaContext {
        return FormulaContext.AGGREGATE;
      }

      public override raw(_key: string): string | null {
        return null;
      }

      public override aggregate(
        key: string,
        aggregation: Aggregation,
        weightKey: Nullable<string>,
      ): Nullable<Decimal> {
        return Decimal.of(`${key === 'f_debe' ? '100' : '40'}`)
          .unwrap()
          .add(Decimal.of(aggregation === Aggregation.SUM && weightKey === null ? '0' : '1').unwrap());
      }
    }
    const kpi: CompiledFormula = compile('=SUMA([Debe]) - [Haber]', FormulaContext.AGGREGATE).unwrap();
    expect(String(new Evaluator(resolver, new Sums()).evaluate(kpi.root))).toBe('60');
  });

  it('lista las agregaciones que pedirá una fórmula agregada, sin repetir', () => {
    const kpi: CompiledFormula = compile(
      '=SI(SUMA([Debe]) > 0; [Haber] / SUMA([Debe]); [% de descuento])',
      FormulaContext.AGGREGATE,
    ).unwrap();
    expect(
      new AggregateRequestCollector(resolver).collect(kpi.root).map((r: AggregateRequest): string => r.id()),
    ).toEqual(['f_debe|SUM|', 'f_haber|SUM|', 'f_desc|WEIGHTED_AVERAGE|f_venta']);
  });

  it('imprime con los paréntesis necesarios', () => {
    expect(compile('=([Debe] - [Haber]) * 2', FormulaContext.RECORD).unwrap().canonicalSource).toBe(
      '=([#f_debe] - [#f_haber]) * 2',
    );
    expect(compile('=[Debe] - ([Haber] - 1)', FormulaContext.RECORD).unwrap().canonicalSource).toBe(
      '=[#f_debe] - ([#f_haber] - 1)',
    );
    expect(compile('=[Debe] - [Haber] - 1', FormulaContext.RECORD).unwrap().canonicalSource).toBe(
      '=[#f_debe] - [#f_haber] - 1',
    );
  });
});
