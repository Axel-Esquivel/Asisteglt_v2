import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InputSignal,
  OutputEmitterRef,
  Signal,
  WritableSignal,
  afterRenderEffect,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ColumnBand,
  DividerCrossing,
  FixedWidthLayout,
  LineClassification,
  LineStatus,
  RejectedLine,
  TextLine,
} from '@asisteglt/shared-ingestion-core';
import { Nullable } from '@asisteglt/shared-kernel';
import { Tooltip } from 'primeng/tooltip';

export interface DividerMove {
  readonly from: number;
  readonly to: number;
}

export enum CanvasFilter {
  ALL = 'ALL',
  DATA = 'DATA',
  REJECTED = 'REJECTED',
}

interface RowView {
  readonly line: TextLine;
  readonly status: Nullable<LineStatus>;
  readonly reason: string;
  readonly selected: boolean;
}

/**
 * Lienzo de ancho fijo (docs/11 §2 y §8): texto monoespaciado con regla, canaleta de estado,
 * franjas de columnas y divisorias que se agregan con clic, se arrastran o se mueven con el teclado
 * (← →, Mayús = 5) y se eliminan con doble clic o Supr. Las posiciones usan la unidad `ch`.
 */
@Component({
  selector: 'app-fixed-width-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tooltip],
  templateUrl: './fixed-width-canvas.html',
  styleUrl: './fixed-width-canvas.scss',
})
export class FixedWidthCanvas {
  public readonly lines: InputSignal<ReadonlyArray<TextLine>> = input.required<ReadonlyArray<TextLine>>();
  public readonly layout: InputSignal<FixedWidthLayout> = input.required<FixedWidthLayout>();
  public readonly classifications: InputSignal<ReadonlyMap<number, LineClassification>> =
    input.required<ReadonlyMap<number, LineClassification>>();
  public readonly crossings: InputSignal<ReadonlyArray<DividerCrossing>> =
    input.required<ReadonlyArray<DividerCrossing>>();
  public readonly bandTitles: InputSignal<ReadonlyMap<number, string>> =
    input.required<ReadonlyMap<number, string>>();
  public readonly filter: InputSignal<CanvasFilter> = input.required<CanvasFilter>();
  public readonly zoom: InputSignal<number> = input.required<number>();
  public readonly selectable: InputSignal<boolean> = input.required<boolean>();
  public readonly selectedLines: InputSignal<ReadonlySet<number>> = input.required<ReadonlySet<number>>();
  public readonly maxLines: InputSignal<number> = input.required<number>();

  public readonly dividerAdded: OutputEmitterRef<number> = output<number>();
  public readonly dividerMoved: OutputEmitterRef<DividerMove> = output<DividerMove>();
  public readonly dividerRemoved: OutputEmitterRef<number> = output<number>();
  public readonly lineToggled: OutputEmitterRef<number> = output<number>();

  protected readonly LineStatus: typeof LineStatus = LineStatus;
  protected readonly dragging: WritableSignal<Nullable<DividerMove>> = signal<Nullable<DividerMove>>(null);
  /** Cursor de teclado del lienzo: ← → lo mueven (Mayús = 5) y Enter coloca una divisoria. */
  protected readonly caret: WritableSignal<Nullable<number>> = signal<Nullable<number>>(null);

  private readonly textColumn: Signal<ElementRef<HTMLElement>> =
    viewChild.required<ElementRef<HTMLElement>>('textColumn');
  private readonly probe: Signal<ElementRef<HTMLElement>> =
    viewChild.required<ElementRef<HTMLElement>>('probe');
  private charWidth: number = 8;

  protected readonly width: Signal<number> = computed((): number => this.layout().lineLength + 2);
  protected readonly fontSize: Signal<number> = computed((): number => Math.round(13 * this.zoom()));
  protected readonly bands: Signal<ColumnBand[]> = computed((): ColumnBand[] => this.layout().bands());
  protected readonly ticks: Signal<number[]> = computed((): number[] => {
    const ticks: number[] = [];
    for (let position = 10; position <= this.layout().lineLength; position += 10) {
      ticks.push(position);
    }
    return ticks;
  });
  protected readonly crossingByPosition: Signal<ReadonlyMap<number, DividerCrossing>> = computed(
    (): ReadonlyMap<number, DividerCrossing> =>
      new Map<number, DividerCrossing>(
        this.crossings().map((c: DividerCrossing): [number, DividerCrossing] => [c.position, c]),
      ),
  );
  protected readonly rows: Signal<RowView[]> = computed((): RowView[] => {
    const filter: CanvasFilter = this.filter();
    const rows: RowView[] = [];
    for (const line of this.lines()) {
      const classification: Nullable<LineClassification> = this.classifications().get(line.number) ?? null;
      const status: Nullable<LineStatus> = classification === null ? null : classification.status();
      const visible: boolean =
        filter === CanvasFilter.ALL ||
        (filter === CanvasFilter.DATA && status === LineStatus.DATA) ||
        (filter === CanvasFilter.REJECTED && status === LineStatus.REJECTED);
      if (visible) {
        rows.push({
          line,
          status,
          reason: classification instanceof RejectedLine ? classification.issues.join(' · ') : '',
          selected: this.selectedLines().has(line.number),
        });
      }
      if (rows.length >= this.maxLines()) {
        break;
      }
    }
    return rows;
  });

  public constructor() {
    afterRenderEffect((): void => {
      this.fontSize();
      const measured: number = this.probe().nativeElement.getBoundingClientRect().width / 10;
      this.charWidth = measured > 0 ? measured : 8;
    });
  }

  protected left(position: number): string {
    return `${String(position)}ch`;
  }

  protected bandTitle(band: ColumnBand): string {
    return this.bandTitles().get(band.start) ?? '';
  }

  protected statusIcon(status: Nullable<LineStatus>): string {
    if (status === LineStatus.DATA) {
      return 'pi pi-check';
    }
    if (status === LineStatus.IGNORED) {
      return 'pi pi-ban';
    }
    return status === LineStatus.REJECTED ? 'pi pi-times' : 'pi pi-minus';
  }

  protected statusLabel(row: RowView): string {
    if (row.status === LineStatus.DATA) {
      return 'dato';
    }
    if (row.status === LineStatus.IGNORED) {
      return 'ignorada';
    }
    return row.status === LineStatus.REJECTED ? 'rechazada' : '';
  }

  protected dividerHint(position: number): string {
    const crossing: Nullable<DividerCrossing> = this.crossingByPosition().get(position) ?? null;
    return crossing === null ? `Posición ${String(position)}` : crossing.message();
  }

  protected onSurfaceClick(event: MouseEvent): void {
    if (this.dragging() !== null) {
      return;
    }
    const position: number = this.positionAt(event.clientX);
    if (position > 0 && position < this.layout().lineLength && !this.layout().has(position)) {
      this.dividerAdded.emit(position);
    }
  }

  protected onSurfaceKey(event: KeyboardEvent): void {
    const step: number = event.shiftKey ? 5 : 1;
    const current: number = this.caret() ?? 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next: number = current + (event.key === 'ArrowLeft' ? -step : step);
      this.caret.set(Math.min(Math.max(1, next), this.layout().lineLength - 1));
    } else if (event.key === 'Enter' && !this.layout().has(current)) {
      event.preventDefault();
      this.dividerAdded.emit(current);
    }
  }

  protected onGutterClick(lineNumber: number): void {
    if (this.selectable()) {
      this.lineToggled.emit(lineNumber);
    }
  }

  protected onGutterKey(event: KeyboardEvent, lineNumber: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onGutterClick(lineNumber);
    }
  }

  protected startDrag(event: PointerEvent, position: number): void {
    event.stopPropagation();
    const target: EventTarget | null = event.target;
    if (target instanceof HTMLElement) {
      target.setPointerCapture(event.pointerId);
    }
    this.dragging.set({ from: position, to: position });
  }

  protected drag(event: PointerEvent): void {
    const current: Nullable<DividerMove> = this.dragging();
    if (current !== null) {
      this.dragging.set({ from: current.from, to: this.positionAt(event.clientX) });
    }
  }

  protected endDrag(event: PointerEvent): void {
    event.stopPropagation();
    const current: Nullable<DividerMove> = this.dragging();
    this.dragging.set(null);
    if (current !== null && current.to !== current.from) {
      this.dividerMoved.emit(current);
    }
  }

  protected onDividerKey(event: KeyboardEvent, position: number): void {
    const step: number = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.dividerMoved.emit({ from: position, to: position + (event.key === 'ArrowLeft' ? -step : step) });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.dividerRemoved.emit(position);
    }
  }

  protected displayed(position: number): number {
    const current: Nullable<DividerMove> = this.dragging();
    return current !== null && current.from === position ? current.to : position;
  }

  private positionAt(clientX: number): number {
    const left: number = this.textColumn().nativeElement.getBoundingClientRect().left;
    return Math.max(0, Math.round((clientX - left) / this.charWidth));
  }
}
