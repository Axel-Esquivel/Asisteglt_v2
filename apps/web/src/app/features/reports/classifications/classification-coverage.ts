import { ClassificationNodeDto } from '@asisteglt/shared-contracts';
import { Nullable, PatternClassifier, PatternTarget, WildcardPattern } from '@asisteglt/shared-kernel';
import { ClassifiableValue, ClassifiableValues } from '../data/analysis.model';

/**
 * Qué valores reales (p. ej. cuentas) captura cada nodo de una clasificación y cuáles quedan sin
 * clasificar. Usa el mismo criterio que el servidor: gana el patrón más específico y una cuenta
 * exacta siempre gana.
 */
export class ClassificationCoverage {
  private readonly nodeByValue: ReadonlyMap<string, Nullable<string>>;
  private readonly counts: ReadonlyMap<string, number>;
  private readonly missing: ReadonlyArray<ClassifiableValue>;

  public constructor(
    nodes: ReadonlyArray<ClassificationNodeDto>,
    public readonly values: ClassifiableValues,
  ) {
    const classifier: PatternClassifier = new PatternClassifier(
      nodes.map((n: ClassificationNodeDto): PatternTarget => ({ key: n.id, patterns: n.patterns })),
    );
    const nodeByValue: Map<string, Nullable<string>> = new Map<string, Nullable<string>>();
    const counts: Map<string, number> = new Map<string, number>();
    const missing: ClassifiableValue[] = [];
    for (const v of values.values) {
      const node: Nullable<string> = classifier.classify(v.value);
      nodeByValue.set(v.value, node);
      if (node === null) {
        missing.push(v);
      } else {
        counts.set(node, (counts.get(node) ?? 0) + 1);
      }
    }
    this.nodeByValue = nodeByValue;
    this.counts = counts;
    this.missing = missing;
  }

  /** Cuentas exactas (sin comodines) de un nodo. */
  public static exactValues(node: ClassificationNodeDto): string[] {
    return node.patterns.filter((p: string): boolean => WildcardPattern.isExact(p));
  }

  /** Patrones con comodines de un nodo. */
  public static wildcardPatterns(node: ClassificationNodeDto): string[] {
    return node.patterns.filter((p: string): boolean => !WildcardPattern.isExact(p));
  }

  /**
   * Agrega cuentas exactas a un nodo y las quita de los demás nodos, para que cada cuenta quede
   * escrita en un solo lugar.
   */
  public static assign(
    nodes: ReadonlyArray<ClassificationNodeDto>,
    nodeId: string,
    accounts: ReadonlyArray<string>,
  ): ClassificationNodeDto[] {
    const moved: Set<string> = new Set<string>(accounts.map((a: string): string => a.trim().toLowerCase()));
    return nodes.map((n: ClassificationNodeDto): ClassificationNodeDto => {
      const kept: string[] = n.patterns.filter(
        (p: string): boolean => !WildcardPattern.isExact(p) || !moved.has(p.trim().toLowerCase()),
      );
      return n.id === nodeId
        ? { ...n, patterns: [...kept, ...accounts.map((a: string): string => a.trim())] }
        : { ...n, patterns: kept };
    });
  }

  /** Nodo que captura el valor, o `null` si queda sin clasificar o no aparece en los datos. */
  public nodeOf(value: string): Nullable<string> {
    return this.nodeByValue.get(value) ?? null;
  }

  /** Cuántos valores de los datos captura directamente el nodo. */
  public countOf(nodeId: string): number {
    return this.counts.get(nodeId) ?? 0;
  }

  public unclassified(): ReadonlyArray<ClassifiableValue> {
    return this.missing;
  }

  /** Valores sin clasificar que aparecieron por primera vez en el último período cargado. */
  public newUnclassified(): ClassifiableValue[] {
    return this.missing.filter((v: ClassifiableValue): boolean => this.values.isNew(v));
  }
}
