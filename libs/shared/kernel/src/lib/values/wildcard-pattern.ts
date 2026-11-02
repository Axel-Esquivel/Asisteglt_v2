import { Nullable } from '../core/nullable';

/**
 * Patrón de texto con `*` (cualquier texto) y `?` (un carácter), sin distinguir mayúsculas ni
 * espacios en los extremos. Sin comodines es un valor exacto (p. ej. una cuenta concreta).
 */
export class WildcardPattern {
  private readonly regex: RegExp;
  private readonly literals: number;
  private readonly exact: boolean;

  public constructor(public readonly source: string) {
    const trimmed: string = source.trim();
    const body: string = trimmed
      .split('')
      .map((c: string): string =>
        c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
    this.regex = new RegExp(`^${body}$`, 'is');
    this.literals = trimmed.replace(/[*?]/g, '').length;
    this.exact = !/[*?]/.test(trimmed);
  }

  /** `true` si no tiene comodines: identifica un único valor. */
  public static isExact(source: string): boolean {
    return !/[*?]/.test(source.trim());
  }

  public matches(value: string): boolean {
    return this.regex.test(value.trim());
  }

  public isExact(): boolean {
    return this.exact;
  }

  /**
   * Positivo si este patrón es más específico que `other`: más caracteres literales y, a igualdad,
   * el valor exacto gana sobre el que tiene comodines.
   */
  public compareSpecificity(other: WildcardPattern): number {
    if (this.literals !== other.literals) {
      return this.literals - other.literals;
    }
    return Number(this.exact) - Number(other.exact);
  }
}

/** Patrones de un destino (p. ej. un nodo de clasificación). */
export interface PatternTarget {
  readonly key: string;
  readonly patterns: ReadonlyArray<string>;
}

/**
 * Asigna valores al destino cuyo patrón coincidente es el más específico. Los valores exactos se
 * resuelven con un índice, así que miles de cuentas sueltas no hacen lenta la clasificación.
 * A igual especificidad gana el primer destino declarado.
 */
export class PatternClassifier {
  private readonly exactValues: ReadonlyMap<string, string>;
  private readonly wildcards: ReadonlyArray<{ readonly key: string; readonly pattern: WildcardPattern }>;

  public constructor(targets: ReadonlyArray<PatternTarget>) {
    const exactValues: Map<string, string> = new Map<string, string>();
    const wildcards: { readonly key: string; readonly pattern: WildcardPattern }[] = [];
    for (const target of targets) {
      for (const source of target.patterns) {
        const pattern: WildcardPattern = new WildcardPattern(source);
        if (pattern.isExact()) {
          const normalized: string = PatternClassifier.normalize(source);
          if (!exactValues.has(normalized)) {
            exactValues.set(normalized, target.key);
          }
        } else {
          wildcards.push({ key: target.key, pattern });
        }
      }
    }
    this.exactValues = exactValues;
    this.wildcards = wildcards;
  }

  private static normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  /** Destino al que pertenece el valor, o `null` si ningún patrón coincide. */
  public classify(value: string): Nullable<string> {
    const exact: Nullable<string> = this.exactValues.get(PatternClassifier.normalize(value)) ?? null;
    if (exact !== null) {
      return exact;
    }
    let best: Nullable<{ readonly key: string; readonly pattern: WildcardPattern }> = null;
    for (const entry of this.wildcards) {
      if (
        entry.pattern.matches(value) &&
        (best === null || entry.pattern.compareSpecificity(best.pattern) > 0)
      ) {
        best = entry;
      }
    }
    return best === null ? null : best.key;
  }
}
