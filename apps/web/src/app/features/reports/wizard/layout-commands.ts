import { FixedWidthLayout } from '@asisteglt/shared-ingestion-core';
import { Result } from '@asisteglt/shared-kernel';

/** Cambio reversible de las divisorias (patrón comando para deshacer / rehacer). */
export abstract class LayoutCommand {
  public abstract execute(layout: FixedWidthLayout): Result<FixedWidthLayout>;
  public abstract undo(layout: FixedWidthLayout): FixedWidthLayout;
}

export class AddDividerCommand extends LayoutCommand {
  public constructor(private readonly position: number) {
    super();
  }

  public override execute(layout: FixedWidthLayout): Result<FixedWidthLayout> {
    return layout.addDivider(this.position);
  }

  public override undo(layout: FixedWidthLayout): FixedWidthLayout {
    return layout.removeDivider(this.position);
  }
}

export class MoveDividerCommand extends LayoutCommand {
  public constructor(
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  public override execute(layout: FixedWidthLayout): Result<FixedWidthLayout> {
    return layout.moveDivider(this.from, this.to);
  }

  public override undo(layout: FixedWidthLayout): FixedWidthLayout {
    return layout.moveDivider(this.to, this.from).match(
      (l: FixedWidthLayout): FixedWidthLayout => l,
      (): FixedWidthLayout => layout,
    );
  }
}

export class RemoveDividerCommand extends LayoutCommand {
  public constructor(private readonly position: number) {
    super();
  }

  public override execute(layout: FixedWidthLayout): Result<FixedWidthLayout> {
    return Result.ok(layout.removeDivider(this.position));
  }

  public override undo(layout: FixedWidthLayout): FixedWidthLayout {
    return layout.addDivider(this.position).match(
      (l: FixedWidthLayout): FixedWidthLayout => l,
      (): FixedWidthLayout => layout,
    );
  }
}

/** Reemplaza todas las divisorias (p. ej. al aceptar las sugerencias). */
export class ReplaceDividersCommand extends LayoutCommand {
  private previous: ReadonlyArray<number> = [];

  public constructor(private readonly positions: ReadonlyArray<number>) {
    super();
  }

  public override execute(layout: FixedWidthLayout): Result<FixedWidthLayout> {
    this.previous = layout.dividers();
    return FixedWidthLayout.of(this.positions, layout.lineLength);
  }

  public override undo(layout: FixedWidthLayout): FixedWidthLayout {
    return FixedWidthLayout.of(this.previous, layout.lineLength).match(
      (l: FixedWidthLayout): FixedWidthLayout => l,
      (): FixedWidthLayout => layout,
    );
  }
}
