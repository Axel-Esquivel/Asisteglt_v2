import { TextLine } from '../text/text-line';
import { FixedWidthLayout } from './fixed-width-layout';

/** Divisoria que corta valores (caracteres no blancos a ambos lados) en líneas de datos. */
export class DividerCrossing {
  public constructor(
    public readonly position: number,
    public readonly lineNumbers: ReadonlyArray<number>,
    public readonly sample: string,
  ) {}

  public message(): string {
    const count: number = this.lineNumbers.length;
    return `La divisoria ${String(this.position)} corta «${this.sample}» en ${String(count)} ${count === 1 ? 'línea' : 'líneas'}`;
  }
}

export class CrossingDetector {
  public detect(lines: ReadonlyArray<TextLine>, layout: FixedWidthLayout): DividerCrossing[] {
    const crossings: DividerCrossing[] = [];
    for (const position of layout.dividers()) {
      const affected: number[] = [];
      let sample: string = '';
      for (const line of lines) {
        if (line.charAt(position - 1).trim() !== '' && line.charAt(position).trim() !== '') {
          affected.push(line.number);
          if (sample === '') {
            sample = CrossingDetector.wordAround(line.text, position);
          }
        }
      }
      if (affected.length > 0) {
        crossings.push(new DividerCrossing(position, affected, sample));
      }
    }
    return crossings;
  }

  private static wordAround(text: string, position: number): string {
    let start: number = position;
    let end: number = position;
    while (start > 0 && text.charAt(start - 1).trim() !== '') {
      start -= 1;
    }
    while (end < text.length && text.charAt(end).trim() !== '') {
      end += 1;
    }
    return text.slice(start, end);
  }
}
