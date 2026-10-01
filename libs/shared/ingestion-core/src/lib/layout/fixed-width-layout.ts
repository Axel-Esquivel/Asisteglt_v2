import { Result, ValidationError } from '@asisteglt/shared-kernel';
import { TextLine } from '../text/text-line';

/** Franja entre dos divisorias: posiciones [start, end) en caracteres (0-based). */
export class ColumnBand {
  public constructor(
    public readonly index: number,
    public readonly start: number,
    public readonly end: number,
  ) {}

  public width(): number {
    return this.end - this.start;
  }

  public extract(line: TextLine, isLast: boolean): string {
    return isLast ? line.text.slice(this.start) : line.slice(this.start, this.end);
  }
}

/**
 * Divisorias de un archivo de ancho fijo. Una divisoria en `p` separa el carácter `p - 1`
 * del carácter `p`. Es inmutable: cada cambio devuelve un nuevo layout.
 */
export class FixedWidthLayout {
  private constructor(
    private readonly positions: ReadonlyArray<number>,
    public readonly lineLength: number,
  ) {}

  public static empty(lineLength: number): FixedWidthLayout {
    return new FixedWidthLayout([], Math.max(1, lineLength));
  }

  public static of(positions: ReadonlyArray<number>, lineLength: number): Result<FixedWidthLayout> {
    let layout: FixedWidthLayout = FixedWidthLayout.empty(lineLength);
    for (const position of positions) {
      const next: Result<FixedWidthLayout> = layout.addDivider(position);
      if (!next.isOk()) {
        return next;
      }
      layout = next.unwrap();
    }
    return Result.ok(layout);
  }

  public dividers(): ReadonlyArray<number> {
    return this.positions;
  }

  public has(position: number): boolean {
    return this.positions.includes(position);
  }

  public addDivider(position: number): Result<FixedWidthLayout> {
    if (!Number.isInteger(position) || position <= 0 || position >= this.lineLength) {
      return Result.fail(
        new ValidationError(
          'INVALID_DIVIDER',
          `La divisoria debe estar entre 1 y ${String(this.lineLength - 1)}`,
        ),
      );
    }
    if (this.has(position)) {
      return Result.fail(
        new ValidationError('DUPLICATE_DIVIDER', `Ya existe una divisoria en ${String(position)}`),
      );
    }
    const sorted: number[] = [...this.positions, position].sort((a: number, b: number): number => a - b);
    return Result.ok(new FixedWidthLayout(sorted, this.lineLength));
  }

  /** Mueve una divisoria sin cruzar a sus vecinas. */
  public moveDivider(from: number, to: number): Result<FixedWidthLayout> {
    const index: number = this.positions.indexOf(from);
    if (index < 0) {
      return Result.fail(new ValidationError('DIVIDER_NOT_FOUND', `No hay divisoria en ${String(from)}`));
    }
    const lower: number = index === 0 ? 0 : (this.positions[index - 1] ?? 0);
    const upper: number =
      index === this.positions.length - 1 ? this.lineLength : (this.positions[index + 1] ?? this.lineLength);
    if (to <= lower || to >= upper) {
      return Result.fail(new ValidationError('DIVIDER_CROSSES', 'Una divisoria no puede cruzar a otra'));
    }
    return Result.ok(
      new FixedWidthLayout(
        this.positions.map((p: number): number => (p === from ? to : p)),
        this.lineLength,
      ),
    );
  }

  public removeDivider(position: number): FixedWidthLayout {
    return new FixedWidthLayout(
      this.positions.filter((p: number): boolean => p !== position),
      this.lineLength,
    );
  }

  public withLineLength(lineLength: number): FixedWidthLayout {
    const length: number = Math.max(lineLength, (this.positions[this.positions.length - 1] ?? 0) + 1);
    return new FixedWidthLayout(this.positions, length);
  }

  public bands(): ColumnBand[] {
    const bounds: number[] = [0, ...this.positions, this.lineLength];
    const bands: ColumnBand[] = [];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      bands.push(new ColumnBand(i, bounds[i] ?? 0, bounds[i + 1] ?? this.lineLength));
    }
    return bands;
  }

  public slice(line: TextLine): string[] {
    const bands: ColumnBand[] = this.bands();
    return bands.map((band: ColumnBand): string => band.extract(line, band.index === bands.length - 1));
  }
}
