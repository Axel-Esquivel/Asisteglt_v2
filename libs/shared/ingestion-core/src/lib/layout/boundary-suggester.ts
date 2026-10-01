import { TextLine } from '../text/text-line';

/**
 * Sugiere divisorias a partir de la ocupación de cada posición (docs/11 §4): un hueco es un
 * rango de posiciones vacías en al menos el 98 % de las líneas candidatas.
 */
export class BoundarySuggester {
  public constructor(private readonly emptyThreshold: number) {}

  public static standard(): BoundarySuggester {
    return new BoundarySuggester(0.98);
  }

  /**
   * Evalúa cada «forma» de línea frecuente (columna del primer carácter no blanco y si es dígito,
   * letra u otro) y se queda con la que produce más columnas consistentes: así los encabezados de
   * página repetidos no tapan los huecos entre las columnas de datos.
   */
  public suggest(lines: ReadonlyArray<TextLine>): number[] {
    const nonBlank: TextLine[] = lines.filter((line: TextLine): boolean => !line.isBlank());
    const groups: Map<string, TextLine[]> = new Map<string, TextLine[]>();
    for (const line of nonBlank) {
      const key: string = BoundarySuggester.shape(line);
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    const minimum: number = Math.max(2, nonBlank.length * 0.15);
    let best: number[] = this.suggestFor(nonBlank);
    let bestSize: number = nonBlank.length;
    groups.forEach((group: TextLine[]): void => {
      if (group.length >= minimum) {
        const candidate: number[] = this.suggestFor(group);
        if (candidate.length > best.length || (candidate.length === best.length && group.length > bestSize)) {
          best = candidate;
          bestSize = group.length;
        }
      }
    });
    return best;
  }

  private static shape(line: TextLine): string {
    const index: number = line.text.search(/\S/);
    const char: string = line.text.charAt(index);
    const kind: string = /\p{Nd}/u.test(char) ? 'd' : /\p{L}/u.test(char) ? 'l' : 'o';
    return `${String(index)}:${kind}`;
  }

  private suggestFor(candidates: ReadonlyArray<TextLine>): number[] {
    if (candidates.length === 0) {
      return [];
    }
    const width: number = candidates.reduce(
      (max: number, line: TextLine): number => Math.max(max, line.text.length),
      0,
    );
    const empty: boolean[] = [];
    for (let position = 0; position < width; position += 1) {
      const blanks: number = candidates.filter(
        (line: TextLine): boolean => line.charAt(position).trim() === '',
      ).length;
      empty.push(blanks / candidates.length >= this.emptyThreshold);
    }
    const gaps: Array<{ readonly start: number; readonly end: number }> = [];
    let start: number = -1;
    for (let position = 0; position <= width; position += 1) {
      const isEmpty: boolean = position < width && (empty[position] ?? false);
      if (isEmpty && start < 0) {
        start = position;
      } else if (!isEmpty && start >= 0) {
        gaps.push({ start, end: position });
        start = -1;
      }
    }
    const dividers: number[] = [];
    gaps.forEach((gap: { readonly start: number; readonly end: number }, index: number): void => {
      if (gap.start === 0 || gap.end >= width) {
        return;
      }
      const next: { readonly start: number; readonly end: number } | null = gaps[index + 1] ?? null;
      const nextGapStart: number = next === null ? width : next.start;
      const rightAligned: boolean = this.isRightAligned(candidates, gap.end, nextGapStart);
      if (gap.end - gap.start === 1 && !rightAligned) {
        return;
      }
      dividers.push(rightAligned ? gap.start : gap.end);
    });
    return dividers;
  }

  /** Los bordes derechos coinciden en la mayoría de las líneas con contenido (números). */
  private isRightAligned(lines: ReadonlyArray<TextLine>, start: number, end: number): boolean {
    const edges: Map<number, number> = new Map<number, number>();
    let filled: number = 0;
    for (const line of lines) {
      const segment: string = line.slice(start, end);
      const trimmed: string = segment.trimEnd();
      if (trimmed.trim().length === 0) {
        continue;
      }
      filled += 1;
      const edge: number = start + trimmed.length;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    const best: number = Math.max(0, ...edges.values());
    return (
      filled > 1 &&
      best / filled >= 0.8 &&
      [...edges.keys()].length > 0 &&
      this.hasVaryingStarts(lines, start, end)
    );
  }

  private hasVaryingStarts(lines: ReadonlyArray<TextLine>, start: number, end: number): boolean {
    const starts: Set<number> = new Set<number>();
    for (const line of lines) {
      const segment: string = line.slice(start, end);
      if (segment.trim().length > 0) {
        starts.add(start + segment.length - segment.trimStart().length);
      }
    }
    return starts.size > 1;
  }
}
