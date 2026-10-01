import { Injectable, Signal, WritableSignal, computed, signal } from '@angular/core';
import {
  ColumnSpec,
  DataType,
  DerivedAttributeKind,
  DerivedAttributeSpec,
  EmptyHandling,
  FieldRole,
  FixedWidthSpec,
  IdentifierMaskSpec,
  ProfileRequest,
  RowRuleKind,
  RowRuleSpec,
  TextOperator,
} from '@asisteglt/shared-contracts';
import {
  BoundarySuggester,
  ColumnBand,
  ColumnDefaults,
  CrossingDetector,
  DividerCrossing,
  FixedWidthLayout,
  FixedWidthReader,
  LineClassification,
  LineStatus,
  PageHeaderBlockRule,
  ReadSummary,
  SkipBlankLinesRule,
  SkipLeadingLinesRule,
  SkipMatchingTextRule,
  SkipPageBreaksRule,
  TextDocument,
  TextEncoding,
  TextLine,
  TextMask,
} from '@asisteglt/shared-ingestion-core';
import { DomainError, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { ProfileView } from '../data/profile.model';
import { LayoutCommand } from './layout-commands';

/** Formato de una columna asignada (la franja se identifica por su posición inicial). */
export type ColumnSettings = Omit<ColumnSpec, 'bandIndex'>;

export enum EncodingChoice {
  AUTO = 'auto',
  UTF8 = 'utf-8',
  WINDOWS_1252 = 'windows-1252',
}

/** Franja con su encabezado asignado y un valor de ejemplo para la tabla de columnas. */
export class BandView {
  public constructor(
    public readonly band: ColumnBand,
    public readonly settings: Nullable<ColumnSettings>,
    public readonly sample: string,
  ) {}
}

/**
 * Estado del asistente de ancho fijo (docs/11). Lo que se ve en la vista previa es exactamente lo
 * que importará el servidor: ambos usan `FixedWidthReader` de `ingestion-core`.
 */
@Injectable()
export class FixedWidthWizardStore {
  public static readonly CANVAS_LINES: number = 400;
  public static readonly PREVIEW_LINES: number = 5000;

  public readonly name: WritableSignal<string> = signal<string>('');
  public readonly description: WritableSignal<string> = signal<string>('');
  public readonly extensions: WritableSignal<string[]> = signal<string[]>(['.txt']);
  public readonly fileNamePattern: WritableSignal<string> = signal<string>('');
  public readonly encoding: WritableSignal<EncodingChoice> = signal<EncodingChoice>(EncodingChoice.AUTO);
  public readonly tabSize: WritableSignal<number> = signal<number>(8);
  public readonly sampleName: WritableSignal<string> = signal<string>('');
  public readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  public readonly rules: WritableSignal<RowRuleSpec[]> = signal<RowRuleSpec[]>([
    new SkipBlankLinesRule().toSpec(),
    new SkipPageBreaksRule().toSpec(),
  ]);
  public readonly masks: WritableSignal<IdentifierMaskSpec[]> = signal<IdentifierMaskSpec[]>([]);
  public readonly derived: WritableSignal<DerivedAttributeSpec[]> = signal<DerivedAttributeSpec[]>([]);
  public readonly selectedLines: WritableSignal<ReadonlySet<number>> = signal<ReadonlySet<number>>(
    new Set<number>(),
  );

  private readonly bytes: WritableSignal<Nullable<Uint8Array>> = signal<Nullable<Uint8Array>>(null);
  private readonly layoutState: WritableSignal<FixedWidthLayout> = signal<FixedWidthLayout>(
    FixedWidthLayout.empty(80),
  );
  private readonly assignments: WritableSignal<ReadonlyMap<number, ColumnSettings>> = signal<
    ReadonlyMap<number, ColumnSettings>
  >(new Map<number, ColumnSettings>());
  private readonly undoStack: WritableSignal<LayoutCommand[]> = signal<LayoutCommand[]>([]);
  private readonly redoStack: WritableSignal<LayoutCommand[]> = signal<LayoutCommand[]>([]);

  public readonly layout: Signal<FixedWidthLayout> = this.layoutState.asReadonly();
  public readonly canUndo: Signal<boolean> = computed((): boolean => this.undoStack().length > 0);
  public readonly canRedo: Signal<boolean> = computed((): boolean => this.redoStack().length > 0);

  public readonly resolvedEncoding: Signal<TextEncoding> = computed((): TextEncoding => {
    const bytes: Nullable<Uint8Array> = this.bytes();
    const choice: EncodingChoice = this.encoding();
    if (choice === EncodingChoice.UTF8) {
      return TextEncoding.UTF8;
    }
    if (choice === EncodingChoice.WINDOWS_1252) {
      return TextEncoding.WINDOWS_1252;
    }
    return bytes === null ? TextEncoding.UTF8 : TextDocument.detectEncoding(bytes);
  });

  public readonly document: Signal<Nullable<TextDocument>> = computed((): Nullable<TextDocument> => {
    const bytes: Nullable<Uint8Array> = this.bytes();
    return bytes === null
      ? null
      : TextDocument.decode(bytes, this.resolvedEncoding(), this.tabSize()).head(
          FixedWidthWizardStore.PREVIEW_LINES,
        );
  });

  public readonly lines: Signal<ReadonlyArray<TextLine>> = computed((): ReadonlyArray<TextLine> => {
    const document: Nullable<TextDocument> = this.document();
    return document === null ? [] : document.all();
  });

  public readonly bands: Signal<BandView[]> = computed((): BandView[] => {
    const assignments: ReadonlyMap<number, ColumnSettings> = this.assignments();
    const samples: ReadonlyArray<TextLine> = this.lines().filter(
      (l: TextLine): boolean => this.statusOf(l.number) === LineStatus.DATA,
    );
    const bands: ColumnBand[] = this.layoutState().bands();
    return bands.map((band: ColumnBand): BandView => {
      const sample: string =
        samples
          .map((l: TextLine): string => band.extract(l, band.index === bands.length - 1).trim())
          .find((v: string): boolean => v.length > 0) ?? '';
      return new BandView(band, assignments.get(band.start) ?? null, sample);
    });
  });

  public readonly spec: Signal<FixedWidthSpec> = computed((): FixedWidthSpec => {
    const layout: FixedWidthLayout = this.layoutState();
    const columns: ColumnSpec[] = [];
    for (const band of layout.bands()) {
      const settings: Nullable<ColumnSettings> = this.assignments().get(band.start) ?? null;
      if (settings !== null) {
        columns.push({ ...settings, bandIndex: band.index });
      }
    }
    return {
      encoding: this.encoding(),
      tabSize: this.tabSize(),
      lineLength: layout.lineLength,
      dividers: layout.dividers(),
      rowRules: this.rules(),
      masks: this.masks().filter((m: IdentifierMaskSpec): boolean =>
        columns.some((c: ColumnSpec): boolean => c.fieldKey === m.fieldKey),
      ),
      columns,
      derived: this.derived(),
    };
  });

  public readonly reader: Signal<Result<FixedWidthReader>> = computed((): Result<FixedWidthReader> =>
    FixedWidthReader.create(this.spec(), this.catalog().labels()),
  );

  public readonly classifications: Signal<ReadonlyMap<number, LineClassification>> = computed(
    (): ReadonlyMap<number, LineClassification> => {
      const reader: Result<FixedWidthReader> = this.reader();
      const map: Map<number, LineClassification> = new Map<number, LineClassification>();
      if (reader.isOk()) {
        for (const classification of reader.unwrap().classifyAll(this.lines())) {
          map.set(classification.lineNumber, classification);
        }
      }
      return map;
    },
  );

  public readonly summary: Signal<ReadSummary> = computed((): ReadSummary =>
    FixedWidthReader.summarize([...this.classifications().values()]),
  );

  public readonly crossings: Signal<DividerCrossing[]> = computed((): DividerCrossing[] => {
    const candidates: TextLine[] = this.lines().filter(
      (l: TextLine): boolean => this.statusOf(l.number) !== LineStatus.IGNORED,
    );
    return new CrossingDetector().detect(candidates, this.layoutState());
  });

  public readonly identifierColumns: Signal<CatalogFieldView[]> = computed((): CatalogFieldView[] =>
    this.spec()
      .columns.filter((c: ColumnSpec): boolean => c.role === FieldRole.IDENTIFIER)
      .map((c: ColumnSpec): Nullable<CatalogFieldView> => this.catalog().find(c.fieldKey))
      .filter((f: Nullable<CatalogFieldView>): f is CatalogFieldView => f !== null),
  );

  public loadSample(fileName: string, bytes: Uint8Array): void {
    this.sampleName.set(fileName);
    this.bytes.set(bytes);
    const document: Nullable<TextDocument> = this.document();
    if (document !== null) {
      this.layoutState.set(this.layoutState().withLineLength(Math.max(document.maxLineLength(), 1)));
    }
  }

  public hasSample(): boolean {
    return this.bytes() !== null;
  }

  public statusOf(lineNumber: number): Nullable<LineStatus> {
    const classification: Nullable<LineClassification> = this.classifications().get(lineNumber) ?? null;
    return classification === null ? null : classification.status();
  }

  public execute(command: LayoutCommand): Result<FixedWidthLayout> {
    const result: Result<FixedWidthLayout> = command.execute(this.layoutState());
    if (result.isOk()) {
      this.applyLayout(result.unwrap());
      this.undoStack.update((stack: LayoutCommand[]): LayoutCommand[] => [...stack, command]);
      this.redoStack.set([]);
    }
    return result;
  }

  public undo(): void {
    const command: Nullable<LayoutCommand> = this.undoStack()[this.undoStack().length - 1] ?? null;
    if (command !== null) {
      this.applyLayout(command.undo(this.layoutState()));
      this.undoStack.update((stack: LayoutCommand[]): LayoutCommand[] => stack.slice(0, -1));
      this.redoStack.update((stack: LayoutCommand[]): LayoutCommand[] => [...stack, command]);
    }
  }

  public redo(): void {
    const command: Nullable<LayoutCommand> = this.redoStack()[this.redoStack().length - 1] ?? null;
    if (command !== null) {
      command.execute(this.layoutState()).match(
        (layout: FixedWidthLayout): void => this.applyLayout(layout),
        (): void => {
          // El comando ya no aplica; se descarta.
        },
      );
      this.redoStack.update((stack: LayoutCommand[]): LayoutCommand[] => stack.slice(0, -1));
      this.undoStack.update((stack: LayoutCommand[]): LayoutCommand[] => [...stack, command]);
    }
  }

  public suggestions(): number[] {
    const candidates: TextLine[] = this.lines()
      .slice(0, 2000)
      .filter((l: TextLine): boolean => this.statusOf(l.number) !== LineStatus.IGNORED);
    return BoundarySuggester.standard().suggest(candidates);
  }

  public assign(band: ColumnBand, field: Nullable<CatalogFieldView>): void {
    this.assignments.update(
      (current: ReadonlyMap<number, ColumnSettings>): ReadonlyMap<number, ColumnSettings> => {
        const next: Map<number, ColumnSettings> = new Map<number, ColumnSettings>(current);
        if (field === null) {
          next.delete(band.start);
        } else {
          next.set(
            band.start,
            FixedWidthWizardStore.settingsOf(
              ColumnDefaults.create(band.index, field.key, field.role, field.dataType, field.nature),
            ),
          );
        }
        return next;
      },
    );
  }

  /** Reemplaza el formato de una columna ya asignada (el encabezado no cambia). */
  public updateSettings(band: ColumnBand, settings: ColumnSettings): void {
    this.assignments.update(
      (current: ReadonlyMap<number, ColumnSettings>): ReadonlyMap<number, ColumnSettings> => {
        const existing: Nullable<ColumnSettings> = current.get(band.start) ?? null;
        if (existing === null || existing.fieldKey !== settings.fieldKey) {
          return current;
        }
        const next: Map<number, ColumnSettings> = new Map<number, ColumnSettings>(current);
        next.set(band.start, settings);
        return next;
      },
    );
  }

  public assignedKeys(): Set<string> {
    return new Set<string>([...this.assignments().values()].map((s: ColumnSettings): string => s.fieldKey));
  }

  public setMask(fieldKey: string, pattern: string): void {
    this.masks.update((masks: IdentifierMaskSpec[]): IdentifierMaskSpec[] => [
      ...masks.filter((m: IdentifierMaskSpec): boolean => m.fieldKey !== fieldKey),
      ...(pattern.trim() === '' ? [] : [{ fieldKey, pattern: pattern.trim() }]),
    ]);
  }

  public maskOf(fieldKey: string): string {
    const mask: Nullable<IdentifierMaskSpec> =
      this.masks().find((m: IdentifierMaskSpec): boolean => m.fieldKey === fieldKey) ?? null;
    return mask === null ? '' : mask.pattern;
  }

  public suggestMask(fieldKey: string): void {
    const band: Nullable<BandView> =
      this.bands().find((b: BandView): boolean => b.settings !== null && b.settings.fieldKey === fieldKey) ??
      null;
    if (band !== null && band.sample !== '') {
      this.setMask(fieldKey, TextMask.fromSample(band.sample).pattern);
    }
  }

  public hasRule(kind: RowRuleKind): boolean {
    return this.rules().some((r: RowRuleSpec): boolean => r.kind === kind);
  }

  public toggleRule(kind: RowRuleKind.SKIP_BLANK | RowRuleKind.SKIP_PAGE_BREAKS, enabled: boolean): void {
    const spec: RowRuleSpec =
      kind === RowRuleKind.SKIP_BLANK ? new SkipBlankLinesRule().toSpec() : new SkipPageBreaksRule().toSpec();
    this.rules.update((rules: RowRuleSpec[]): RowRuleSpec[] => [
      ...rules.filter((r: RowRuleSpec): boolean => r.kind !== kind),
      ...(enabled ? [spec] : []),
    ]);
  }

  public setLeadingLines(count: number): void {
    this.rules.update((rules: RowRuleSpec[]): RowRuleSpec[] => [
      ...rules.filter((r: RowRuleSpec): boolean => r.kind !== RowRuleKind.SKIP_LEADING),
      ...(count > 0 ? [new SkipLeadingLinesRule(count).toSpec()] : []),
    ]);
  }

  public leadingLines(): number {
    const rule: Nullable<RowRuleSpec> =
      this.rules().find((r: RowRuleSpec): boolean => r.kind === RowRuleKind.SKIP_LEADING) ?? null;
    return rule === null ? 0 : rule.count;
  }

  public addMatchingRule(operator: TextOperator, text: string): void {
    if (text.trim().length > 0) {
      this.rules.update((rules: RowRuleSpec[]): RowRuleSpec[] => [
        ...rules,
        new SkipMatchingTextRule(operator, text).toSpec(),
      ]);
    }
  }

  /** Crea el bloque de encabezado de página con las líneas seleccionadas en el lienzo. */
  public addHeaderBlockFromSelection(): number {
    const selected: TextLine[] = this.lines().filter((l: TextLine): boolean =>
      this.selectedLines().has(l.number),
    );
    if (selected.length > 0) {
      this.rules.update((rules: RowRuleSpec[]): RowRuleSpec[] => [
        ...rules,
        PageHeaderBlockRule.fromLines(selected).toSpec(),
      ]);
      this.selectedLines.set(new Set<number>());
    }
    return selected.length;
  }

  public removeRule(index: number): void {
    this.rules.update((rules: RowRuleSpec[]): RowRuleSpec[] =>
      rules.filter((_r: RowRuleSpec, i: number): boolean => i !== index),
    );
  }

  public toggleLine(lineNumber: number): void {
    this.selectedLines.update((current: ReadonlySet<number>): ReadonlySet<number> => {
      const next: Set<number> = new Set<number>(current);
      if (next.has(lineNumber)) {
        next.delete(lineNumber);
      } else {
        next.add(lineNumber);
      }
      return next;
    });
  }

  public addDerived(kind: DerivedAttributeKind, sourceKey: string, targetKey: string): void {
    this.derived.update((items: DerivedAttributeSpec[]): DerivedAttributeSpec[] => [
      ...items.filter((d: DerivedAttributeSpec): boolean => d.targetKey !== targetKey),
      { kind, sourceKey, targetKey, separator: '.', spacesPerLevel: 3 },
    ]);
  }

  public removeDerived(targetKey: string): void {
    this.derived.update((items: DerivedAttributeSpec[]): DerivedAttributeSpec[] =>
      items.filter((d: DerivedAttributeSpec): boolean => d.targetKey !== targetKey),
    );
  }

  public request(): ProfileRequest {
    return {
      name: this.name(),
      description: this.description(),
      extensions: this.extensions(),
      fileNamePattern: this.fileNamePattern().trim() === '' ? null : this.fileNamePattern(),
      spec: this.spec(),
    };
  }

  /** Carga una preconfiguración existente para editarla (el archivo de muestra se vuelve a elegir). */
  public edit(profile: ProfileView): Result<true> {
    const s = profile.s;
    const layout: Result<FixedWidthLayout> = FixedWidthLayout.of(s.spec.dividers, s.spec.lineLength);
    if (!layout.isOk()) {
      return Result.fail(layout.errorOrNull() ?? FixedWidthWizardStore.invalid());
    }
    this.name.set(s.name);
    this.description.set(s.description);
    this.extensions.set([...s.extensions]);
    this.fileNamePattern.set(s.fileNamePattern ?? '');
    const encoding: Nullable<EncodingChoice> =
      Object.values(EncodingChoice).find((e: EncodingChoice): boolean => e === s.spec.encoding) ?? null;
    this.encoding.set(encoding ?? EncodingChoice.AUTO);
    this.tabSize.set(s.spec.tabSize);
    this.rules.set([...s.spec.rowRules]);
    this.masks.set([...s.spec.masks]);
    this.derived.set([...s.spec.derived]);
    const bands: ColumnBand[] = layout.unwrap().bands();
    const assignments: Map<number, ColumnSettings> = new Map<number, ColumnSettings>();
    for (const column of s.spec.columns) {
      const band: Nullable<ColumnBand> = bands[column.bandIndex] ?? null;
      if (band !== null) {
        assignments.set(band.start, FixedWidthWizardStore.settingsOf(column));
      }
    }
    this.layoutState.set(layout.unwrap());
    this.assignments.set(assignments);
    return Result.ok(true);
  }

  public static settingsOf(column: ColumnSpec): ColumnSettings {
    return {
      fieldKey: column.fieldKey,
      role: column.role,
      dataType: column.dataType,
      nature: column.nature,
      emptyHandling: column.emptyHandling,
      thousandsSeparator: column.thousandsSeparator,
      decimalSeparator: column.decimalSeparator,
      datePattern: column.datePattern,
      trueText: column.trueText,
      falseText: column.falseText,
    };
  }

  public static isNumeric(settings: ColumnSettings): boolean {
    return settings.dataType === DataType.INTEGER || settings.dataType === DataType.DECIMAL;
  }

  public static readonly EMPTY_OPTIONS: { readonly label: string; readonly value: EmptyHandling }[] = [
    { label: 'Vacío = 0', value: EmptyHandling.ZERO },
    { label: 'Vacío = sin valor', value: EmptyHandling.NO_VALUE },
  ];

  /** Al mover divisorias, las columnas cuya franja ya no existe pierden su asignación. */
  private applyLayout(layout: FixedWidthLayout): void {
    const starts: Set<number> = new Set<number>(layout.bands().map((b: ColumnBand): number => b.start));
    this.layoutState.set(layout);
    this.assignments.update(
      (current: ReadonlyMap<number, ColumnSettings>): ReadonlyMap<number, ColumnSettings> => {
        const next: Map<number, ColumnSettings> = new Map<number, ColumnSettings>();
        current.forEach((settings: ColumnSettings, start: number): void => {
          if (starts.has(start)) {
            next.set(start, settings);
          }
        });
        return next;
      },
    );
  }

  private static invalid(): DomainError {
    return new ValidationError('INVALID_PROFILE', 'La preconfiguración no es válida');
  }
}
