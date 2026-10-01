import { Aggregation } from '@asisteglt/shared-contracts';

/** Funciones de agregación (solo en contexto agregado) y la agregación que aplican. */
export class FormulaFunctions {
  public static readonly AGGREGATES: ReadonlyMap<string, Aggregation> = new Map<string, Aggregation>([
    ['SUMA', Aggregation.SUM],
    ['PROMEDIO', Aggregation.AVERAGE],
    ['PROMEDIO.PONDERADO', Aggregation.WEIGHTED_AVERAGE],
    ['MIN', Aggregation.MIN],
    ['MAX', Aggregation.MAX],
    ['ULTIMO', Aggregation.LAST],
    ['CONTAR', Aggregation.COUNT],
  ]);

  public static readonly SCALARS: ReadonlyArray<string> = [
    'SI',
    'DIVIDIR',
    'ABS',
    'REDONDEAR',
    'ESVACIO',
    'Y',
    'O',
    'NO',
  ];

  public static isAggregate(name: string): boolean {
    return FormulaFunctions.AGGREGATES.has(name);
  }

  public static exists(name: string): boolean {
    return FormulaFunctions.isAggregate(name) || FormulaFunctions.SCALARS.includes(name);
  }

  /** Nombres sugeridos por el editor. */
  public static names(): string[] {
    return [...FormulaFunctions.AGGREGATES.keys(), ...FormulaFunctions.SCALARS];
  }
}
