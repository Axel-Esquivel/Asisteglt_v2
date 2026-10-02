import { Signal, WritableSignal, computed, signal } from '@angular/core';
import {
  ChartType,
  ElementKind,
  LayoutBoxDto,
  PageFormatName,
  PageOrientation,
  TemplateElementDto,
  TemplatePageDto,
  TemplateRequest,
  TextAlign,
} from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { NumberFormatter, PageGeometry, TemplateView } from '../data/templates.model';

/** Arrastre o redimensionado en curso (en milímetros de la página). */
class DragState {
  public constructor(
    public readonly elementId: string,
    public readonly resize: boolean,
    public readonly startX: number,
    public readonly startY: number,
    public readonly origin: LayoutBoxDto,
  ) {}
}

/**
 * Estado del diseñador: páginas y elementos editables, selección, arrastre en milímetros con
 * ajuste a 1 mm y validación de límites de la página. La API valida de nuevo al guardar.
 */
export class TemplateDesignerStore {
  public static readonly SCALE: number = 3;

  public readonly name: WritableSignal<string> = signal<string>('');
  public readonly pages: WritableSignal<TemplatePageDto[]> = signal<TemplatePageDto[]>([]);
  public readonly pageIndex: WritableSignal<number> = signal<number>(0);
  public readonly selectedId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  public readonly dirty: WritableSignal<boolean> = signal<boolean>(false);

  public readonly page: Signal<Nullable<TemplatePageDto>> = computed(
    (): Nullable<TemplatePageDto> => this.pages()[this.pageIndex()] ?? null,
  );
  public readonly geometry: Signal<PageGeometry> = computed((): PageGeometry => {
    const page: Nullable<TemplatePageDto> = this.page();
    return page === null ? new PageGeometry(215.9, 279.4) : PageGeometry.of(page);
  });
  public readonly selected: Signal<Nullable<TemplateElementDto>> = computed(
    (): Nullable<TemplateElementDto> => {
      const page: Nullable<TemplatePageDto> = this.page();
      return page === null
        ? null
        : (page.elements.find((e: TemplateElementDto): boolean => e.id === this.selectedId()) ?? null);
    },
  );

  private drag: Nullable<DragState> = null;
  private sequence: number = 0;

  public static blankPage(index: number): TemplatePageDto {
    const [width, height] = PageGeometry.sizeOf(PageFormatName.LETTER);
    return {
      id: `p${String(Date.now())}${String(index)}`,
      name: `Página ${String(index)}`,
      format: PageFormatName.LETTER,
      width,
      height,
      orientation: PageOrientation.PORTRAIT,
      margin: 15,
      header: '{proyecto}',
      footer: 'Página {pagina} de {paginas}',
      elements: [],
    };
  }

  public load(view: TemplateView): void {
    this.name.set(view.name);
    this.pages.set(view.pages);
    this.pageIndex.set(0);
    this.selectedId.set(null);
    this.dirty.set(false);
  }

  public request(): TemplateRequest {
    return { name: this.name(), pages: this.pages() };
  }

  public selectPage(index: number): void {
    this.pageIndex.set(index);
    this.selectedId.set(null);
  }

  public addPage(): void {
    this.pages.update((pages: TemplatePageDto[]): TemplatePageDto[] => [
      ...pages,
      TemplateDesignerStore.blankPage(pages.length + 1),
    ]);
    this.selectPage(this.pages().length - 1);
    this.dirty.set(true);
  }

  public removePage(): void {
    if (this.pages().length <= 1) {
      return;
    }
    const index: number = this.pageIndex();
    this.pages.update((pages: TemplatePageDto[]): TemplatePageDto[] =>
      pages.filter((_p: TemplatePageDto, i: number): boolean => i !== index),
    );
    this.selectPage(Math.max(0, index - 1));
    this.dirty.set(true);
  }

  public updatePage(change: (page: TemplatePageDto) => TemplatePageDto): void {
    const index: number = this.pageIndex();
    this.pages.update((pages: TemplatePageDto[]): TemplatePageDto[] =>
      pages.map((p: TemplatePageDto, i: number): TemplatePageDto => {
        if (i !== index) {
          return p;
        }
        const changed: TemplatePageDto = change(p);
        const [width, height] =
          changed.format === PageFormatName.CUSTOM
            ? [changed.width, changed.height]
            : PageGeometry.sizeOf(changed.format);
        return { ...changed, width, height };
      }),
    );
    this.dirty.set(true);
  }

  public addElement(kind: ElementKind): void {
    const page: Nullable<TemplatePageDto> = this.page();
    if (page === null) {
      return;
    }
    this.sequence += 1;
    const geometry: PageGeometry = this.geometry();
    const width: number = Math.min(
      kind === ElementKind.TEXT || kind === ElementKind.KPI ? 80 : 160,
      geometry.width - 2 * page.margin,
    );
    const height: number = kind === ElementKind.TEXT || kind === ElementKind.KPI ? 20 : 80;
    const element: TemplateElementDto = {
      id: `e${String(Date.now())}${String(this.sequence)}`,
      kind,
      name: TemplateDesignerStore.kindLabel(kind),
      box: { x: page.margin, y: page.margin + 5 * (page.elements.length % 10), width, height },
      style: {
        fontSize: kind === ElementKind.KPI ? 20 : 10,
        bold: kind === ElementKind.KPI,
        align: TextAlign.LEFT,
      },
      numberFormat: NumberFormatter.standard(),
      text: kind === ElementKind.TEXT ? 'Informe de {mes} de {año}' : null,
      reportId: null,
      formula: kind === ElementKind.KPI ? '=SUMA()' : null,
      profileId: null,
      companyId: null,
      chartType: kind === ElementKind.CHART ? ChartType.BAR : null,
      columns: [],
    };
    this.updatePage((p: TemplatePageDto): TemplatePageDto => ({ ...p, elements: [...p.elements, element] }));
    this.selectedId.set(element.id);
  }

  public removeSelected(): void {
    const id: Nullable<string> = this.selectedId();
    this.updatePage((p: TemplatePageDto): TemplatePageDto => ({
      ...p,
      elements: p.elements.filter((e: TemplateElementDto): boolean => e.id !== id),
    }));
    this.selectedId.set(null);
  }

  public updateSelected(change: (element: TemplateElementDto) => TemplateElementDto): void {
    const id: Nullable<string> = this.selectedId();
    this.updatePage((p: TemplatePageDto): TemplatePageDto => ({
      ...p,
      elements: p.elements.map((e: TemplateElementDto): TemplateElementDto => (e.id === id ? change(e) : e)),
    }));
  }

  /** Mueve con el teclado (flechas, 1 mm) dentro de la página. */
  public nudge(dx: number, dy: number): void {
    this.updateSelected((e: TemplateElementDto): TemplateElementDto => ({
      ...e,
      box: this.clamp({ ...e.box, x: e.box.x + dx, y: e.box.y + dy }),
    }));
  }

  public startDrag(element: TemplateElementDto, resize: boolean, clientX: number, clientY: number): void {
    this.selectedId.set(element.id);
    this.drag = new DragState(element.id, resize, clientX, clientY, element.box);
  }

  public dragTo(clientX: number, clientY: number): void {
    const drag: Nullable<DragState> = this.drag;
    if (drag === null) {
      return;
    }
    const dx: number = Math.round((clientX - drag.startX) / TemplateDesignerStore.SCALE);
    const dy: number = Math.round((clientY - drag.startY) / TemplateDesignerStore.SCALE);
    const o: LayoutBoxDto = drag.origin;
    const box: LayoutBoxDto = drag.resize
      ? { ...o, width: Math.max(5, o.width + dx), height: Math.max(5, o.height + dy) }
      : { ...o, x: o.x + dx, y: o.y + dy };
    this.updateSelected((e: TemplateElementDto): TemplateElementDto => ({ ...e, box: this.clamp(box) }));
  }

  public endDrag(): void {
    this.drag = null;
  }

  public isDragging(): boolean {
    return this.drag !== null;
  }

  public static kindLabel(kind: ElementKind): string {
    switch (kind) {
      case ElementKind.TEXT:
        return 'Texto';
      case ElementKind.MATRIX:
        return 'Tabla';
      case ElementKind.KPI:
        return 'Indicador';
      case ElementKind.CHART:
        return 'Gráfico';
    }
  }

  private clamp(box: LayoutBoxDto): LayoutBoxDto {
    const g: PageGeometry = this.geometry();
    const width: number = Math.min(Math.max(5, box.width), g.width);
    const height: number = Math.min(Math.max(5, box.height), g.height);
    return {
      x: Math.min(Math.max(0, box.x), Math.floor(g.width - width)),
      y: Math.min(Math.max(0, box.y), Math.floor(g.height - height)),
      width,
      height,
    };
  }
}
