import {
  ChangeDetectionStrategy,
  Component,
  InputSignal,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  DataType,
  DerivedAttributeKind,
  DerivedAttributeSpec,
  EmptyHandling,
  FieldRole,
  NumericNature,
  RowRuleKind,
  RowRuleSpec,
  TextOperator,
} from '@asisteglt/shared-contracts';
import {
  ColumnBand,
  DataLine,
  DividerCrossing,
  FixedWidthLayout,
  LineClassification,
  ReadSummary,
  RejectedLine,
  RowRule,
  TextDocument,
} from '@asisteglt/shared-ingestion-core';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { MeterItem } from 'primeng/metergroup';
import { AutoComplete } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FileSelectEvent, FileUpload } from 'primeng/fileupload';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MeterGroup } from 'primeng/metergroup';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Slider } from 'primeng/slider';
import { Step, StepList, StepPanel, StepPanels, Stepper } from 'primeng/stepper';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Toolbar } from 'primeng/toolbar';
import { ProjectContext } from '../../projects/data/project-context';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { ProfileView } from '../data/profile.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option } from '../data/reports-labels';
import { CanvasFilter, DividerMove, FixedWidthCanvas } from './fixed-width-canvas';
import { BandView, ColumnSettings, EncodingChoice, FixedWidthWizardStore } from './fixed-width-wizard.store';
import {
  AddDividerCommand,
  MoveDividerCommand,
  RemoveDividerCommand,
  ReplaceDividersCommand,
} from './layout-commands';

interface PreviewRow {
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}

/** Asistente de preconfiguración de ancho fijo (docs/11 §3). La muestra nunca sale del navegador. */
@Component({
  selector: 'app-profile-wizard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    FixedWidthCanvas,
    AutoComplete,
    Button,
    Card,
    FileUpload,
    FloatLabel,
    InputNumber,
    InputText,
    Message,
    MeterGroup,
    Select,
    SelectButton,
    Slider,
    Stepper,
    StepList,
    Step,
    StepPanels,
    StepPanel,
    TableModule,
    Tag,
    Textarea,
    ToggleSwitch,
    Toolbar,
  ],
  providers: [FixedWidthWizardStore],
  templateUrl: './profile-wizard.page.html',
  styleUrl: './profile-wizard.page.scss',
})
export class ProfileWizardPage implements OnInit {
  /** `new` para crear; el id para editar (enlazado desde la ruta). */
  public readonly profileId: InputSignal<string> = input.required<string>();

  protected readonly store: FixedWidthWizardStore = inject(FixedWidthWizardStore);
  protected readonly step: WritableSignal<number> = signal<number>(1);
  protected readonly zoom: WritableSignal<number> = signal<number>(1);
  protected readonly filter: WritableSignal<CanvasFilter> = signal<CanvasFilter>(CanvasFilter.ALL);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly matchOperator: WritableSignal<TextOperator> = signal<TextOperator>(
    TextOperator.STARTS_WITH,
  );
  protected readonly matchText: WritableSignal<string> = signal<string>('');
  protected readonly derivedKind: WritableSignal<DerivedAttributeKind> = signal<DerivedAttributeKind>(
    DerivedAttributeKind.LEAF_FLAG,
  );
  protected readonly derivedSource: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly derivedTarget: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly maxCanvasLines: number = FixedWidthWizardStore.CANVAS_LINES;
  protected readonly RowRuleKind: typeof RowRuleKind = RowRuleKind;
  protected readonly DataType: typeof DataType = DataType;
  protected readonly FieldRole: typeof FieldRole = FieldRole;

  protected readonly encodingOptions: Option<EncodingChoice>[] = [
    { label: 'Detectar automáticamente', value: EncodingChoice.AUTO },
    { label: 'UTF-8', value: EncodingChoice.UTF8 },
    { label: 'Windows-1252 / ISO-8859-1', value: EncodingChoice.WINDOWS_1252 },
  ];
  protected readonly filterOptions: Option<CanvasFilter>[] = [
    { label: 'Todas', value: CanvasFilter.ALL },
    { label: 'Solo datos', value: CanvasFilter.DATA },
    { label: 'Solo rechazadas', value: CanvasFilter.REJECTED },
  ];
  protected readonly operatorOptions: Option<TextOperator>[] = [
    { label: 'Comienza con', value: TextOperator.STARTS_WITH },
    { label: 'Contiene', value: TextOperator.CONTAINS },
    { label: 'Termina con', value: TextOperator.ENDS_WITH },
  ];
  protected readonly separatorOptions: Option<string>[] = [
    { label: 'Coma (,)', value: ',' },
    { label: 'Punto (.)', value: '.' },
    { label: 'Espacio', value: ' ' },
    { label: 'Ninguno', value: '' },
  ];
  protected readonly decimalOptions: Option<string>[] = [
    { label: 'Punto (.)', value: '.' },
    { label: 'Coma (,)', value: ',' },
  ];
  protected readonly emptyOptions: Option<EmptyHandling>[] = FixedWidthWizardStore.EMPTY_OPTIONS;
  protected readonly derivedKinds: Option<DerivedAttributeKind>[] = [
    { label: 'Es registro de detalle (hoja)', value: DerivedAttributeKind.LEAF_FLAG },
    { label: 'Nivel por segmentos del código', value: DerivedAttributeKind.CODE_SEGMENTS_LEVEL },
    { label: 'Nivel por sangría del nombre', value: DerivedAttributeKind.INDENTATION_LEVEL },
  ];

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly router: Router = inject(Router);

  protected readonly isNew: Signal<boolean> = computed((): boolean => this.profileId() === 'new');

  protected readonly bandTitles: Signal<ReadonlyMap<number, string>> = computed(
    (): ReadonlyMap<number, string> => {
      const titles: Map<number, string> = new Map<number, string>();
      for (const view of this.store.bands()) {
        if (view.settings !== null) {
          titles.set(view.band.start, this.store.catalog().labelOf(view.settings.fieldKey));
        }
      }
      return titles;
    },
  );

  protected readonly meter: Signal<MeterItem[]> = computed((): MeterItem[] => {
    const summary: ReadSummary = this.store.summary();
    const total: number = Math.max(summary.total, 1);
    return [
      {
        label: `Datos (${String(summary.data)})`,
        value: (summary.data * 100) / total,
        color: 'var(--p-green-500)',
      },
      {
        label: `Ignoradas (${String(summary.ignored)})`,
        value: (summary.ignored * 100) / total,
        color: 'var(--p-surface-400)',
      },
      {
        label: `Rechazadas (${String(summary.rejected)})`,
        value: (summary.rejected * 100) / total,
        color: 'var(--p-red-500)',
      },
    ];
  });

  protected readonly previewColumns: Signal<Option<string>[]> = computed((): Option<string>[] => [
    ...this.store
      .spec()
      .columns.map((c): Option<string> => ({
        value: c.fieldKey,
        label: this.store.catalog().labelOf(c.fieldKey),
      })),
    ...this.store
      .derived()
      .map((d: DerivedAttributeSpec): Option<string> => ({
        value: d.targetKey,
        label: this.store.catalog().labelOf(d.targetKey),
      })),
  ]);

  protected readonly previewRows: Signal<PreviewRow[]> = computed((): PreviewRow[] => {
    const rows: PreviewRow[] = [];
    for (const classification of this.store.classifications().values()) {
      if (classification instanceof DataLine) {
        const values: Record<string, string> = {};
        for (const [key, value] of Object.entries(classification.values)) {
          values[key] = value === null ? '—' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value;
        }
        rows.push({ line: classification.lineNumber, values });
      }
      if (rows.length >= 200) {
        break;
      }
    }
    return rows;
  });

  protected readonly rejected: Signal<RejectedLine[]> = computed((): RejectedLine[] =>
    [...this.store.classifications().values()]
      .filter((c: LineClassification): c is RejectedLine => c instanceof RejectedLine)
      .slice(0, 50),
  );

  protected readonly derivedTargets: Signal<Option<string>[]> = computed((): Option<string>[] => {
    const leaf: boolean = this.derivedKind() === DerivedAttributeKind.LEAF_FLAG;
    return this.store
      .catalog()
      .derived()
      .filter((f: CatalogFieldView): boolean =>
        leaf
          ? f.dataType === DataType.BOOLEAN
          : f.dataType === DataType.INTEGER && f.nature === NumericNature.DESCRIPTIVE,
      )
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key }));
  });

  protected readonly derivedSources: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.store
      .spec()
      .columns.filter((c): boolean => c.role !== FieldRole.DATA)
      .map((c): Option<string> => ({ label: this.store.catalog().labelOf(c.fieldKey), value: c.fieldKey })),
  );

  public ngOnInit(): void {
    this.initialize().catch((): void => {
      // Informado en initialize.
    });
  }

  protected fieldOptions(view: BandView): Option<string>[] {
    const used: Set<string> = this.store.assignedKeys();
    return this.store
      .catalog()
      .importable()
      .filter(
        (f: CatalogFieldView): boolean =>
          !used.has(f.key) || (view.settings !== null && view.settings.fieldKey === f.key),
      )
      .map((f: CatalogFieldView): Option<string> => ({
        label: `${f.label} · ${f.typeLabel()}`,
        value: f.key,
      }));
  }

  protected assign(view: BandView, key: Nullable<string>): void {
    this.store.assign(view.band, key === null ? null : this.store.catalog().find(key));
  }

  protected change(view: BandView, settings: ColumnSettings): void {
    this.store.updateSettings(view.band, settings);
  }

  protected isNumeric(settings: ColumnSettings): boolean {
    return FixedWidthWizardStore.isNumeric(settings);
  }

  protected async onSample(event: FileSelectEvent): Promise<void> {
    const file: Nullable<File> = event.currentFiles[0] ?? null;
    if (file !== null) {
      this.store.loadSample(file.name, new Uint8Array(await file.arrayBuffer()));
    }
  }

  protected suggest(): void {
    const positions: number[] = this.store.suggestions();
    if (positions.length === 0) {
      this.notifier.info('No se encontraron columnas evidentes; traza las divisorias manualmente');
      return;
    }
    this.store.execute(new ReplaceDividersCommand(positions));
    this.notifier.info(`Se sugirieron ${String(positions.length)} divisorias; revísalas en el lienzo`);
  }

  protected clearDividers(): void {
    this.store.execute(new ReplaceDividersCommand([]));
  }

  protected addDivider(position: number): void {
    this.report(this.store.execute(new AddDividerCommand(position)));
  }

  protected moveDivider(move: DividerMove): void {
    this.report(this.store.execute(new MoveDividerCommand(move.from, move.to)));
  }

  protected removeDivider(position: number): void {
    this.store.execute(new RemoveDividerCommand(position));
  }

  protected addMatchingRule(): void {
    this.store.addMatchingRule(this.matchOperator(), this.matchText());
    this.matchText.set('');
  }

  protected addHeaderBlock(): void {
    const count: number = this.store.addHeaderBlockFromSelection();
    if (count === 0) {
      this.notifier.info('Selecciona primero en la canaleta las líneas del encabezado de página');
    }
  }

  protected describeRule(rule: RowRuleSpec): string {
    return RowRule.fromSpec(rule).describe();
  }

  protected addDerived(): void {
    const source: Nullable<string> = this.derivedSource();
    const target: Nullable<string> = this.derivedTarget();
    if (source !== null && target !== null) {
      this.store.addDerived(this.derivedKind(), source, target);
      this.derivedTarget.set(null);
    }
  }

  protected kindLabel(kind: DerivedAttributeKind): string {
    const match: Nullable<Option<DerivedAttributeKind>> =
      this.derivedKinds.find((o: Option<DerivedAttributeKind>): boolean => o.value === kind) ?? null;
    return match === null ? kind : match.label;
  }

  protected crossingMessages(): string[] {
    return this.store.crossings().map((c: DividerCrossing): string => c.message());
  }

  protected stats(document: TextDocument): string {
    return `${String(document.count())} líneas · ancho máximo ${String(document.maxLineLength())} · ${String(document.pageBreaks())} saltos de página`;
  }

  protected async save(activate: boolean): Promise<void> {
    this.saving.set(true);
    const request = this.store.request();
    const saved: Result<ProfileView> = this.isNew()
      ? await this.api.createProfile(this.context.id(), request)
      : await this.api.updateProfile(this.context.id(), this.profileId(), request);
    const final: Result<ProfileView> =
      activate && saved.isOk()
        ? await this.api.profileAction(this.context.id(), saved.unwrap().id, 'activate')
        : saved;
    this.saving.set(false);
    const error: Nullable<DomainError> = final.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.notifier.success(
      activate ? 'Preconfiguración guardada y activada' : 'Preconfiguración guardada como borrador',
    );
    await this.router.navigate(['/app/projects', this.context.id(), 'profiles']);
  }

  private report(result: Result<FixedWidthLayout>): void {
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
    }
  }

  private async initialize(): Promise<void> {
    const catalog: Result<CatalogView> = await this.api.fieldCatalog(this.context.id());
    catalog.match(
      (value: CatalogView): void => this.store.catalog.set(value),
      (error): void => this.notifier.error(error),
    );
    if (!this.isNew()) {
      const profile: Result<ProfileView> = await this.api.findProfile(this.context.id(), this.profileId());
      const loaded: Result<true> = profile.flatMap((p: ProfileView): Result<true> => this.store.edit(p));
      const error: Nullable<DomainError> = loaded.errorOrNull();
      if (error !== null) {
        this.notifier.error(error);
      }
    }
  }

  protected bandLabel(band: ColumnBand): string {
    return `${String(band.index + 1)}`;
  }
}
