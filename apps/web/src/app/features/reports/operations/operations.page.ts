import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
  OperationKind,
  OperationStepDto,
  ProjectPermission,
} from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProjectContext } from '../../projects/data/project-context';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { FormulaCheck, OperationsView } from '../data/operations.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option, ReportsLabels } from '../data/reports-labels';

/** Borrador editable de un paso (índice `null` = paso nuevo). */
class StepDraft {
  public constructor(
    public readonly index: Nullable<number>,
    public readonly id: string,
    public kind: OperationKind,
    public targetKey: Nullable<string>,
    public formula: string,
    public sourceKey: Nullable<string>,
  ) {}

  public static blank(): StepDraft {
    return new StepDraft(null, `s${String(Date.now())}`, OperationKind.CALCULATED, null, '=', null);
  }

  public static of(step: OperationStepDto, index: number): StepDraft {
    return new StepDraft(index, step.id, step.kind, step.targetKey, step.formula ?? '=', step.sourceKey);
  }

  public toStep(targetKey: string): OperationStepDto {
    const calculated: boolean = this.kind === OperationKind.CALCULATED;
    return {
      id: this.id,
      kind: this.kind,
      targetKey,
      formula: calculated ? this.formula : null,
      sourceKey: calculated ? null : this.sourceKey,
      collectionId: null,
      rateFieldKey: null,
      targetCurrency: null,
    };
  }
}

/** Nuevo encabezado derivado creado desde el editor de un paso. */
class NewFieldDraft {
  public label: string = '';
  public dataType: DataType = DataType.DECIMAL;
  public nature: Nullable<NumericNature> = NumericNature.AMOUNT;

  public isNumeric(): boolean {
    return this.dataType === DataType.DECIMAL || this.dataType === DataType.INTEGER;
  }
}

/**
 * Operaciones: pasos en orden que escriben encabezados derivados (campos calculados con fórmulas
 * por nombre y acumulados del año). Se aplican al consultar los datos y al calcular informes.
 */
@Component({
  selector: 'app-operations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Card, Dialog, FloatLabel, InputText, Message, Select, TableModule, Tag],
  templateUrl: './operations.page.html',
  styleUrl: '../reports.scss',
})
export class OperationsPage implements OnInit {
  protected readonly kinds: Option<OperationKind>[] = OperationsView.KINDS;
  protected readonly types: Option<DataType>[] = ReportsLabels.TYPES;
  protected readonly natures: Option<NumericNature>[] = ReportsLabels.NATURES;
  protected readonly calculated: OperationKind = OperationKind.CALCULATED;

  protected readonly steps: WritableSignal<OperationStepDto[]> = signal<OperationStepDto[]>([]);
  protected readonly draft: WritableSignal<Nullable<StepDraft>> = signal<Nullable<StepDraft>>(null);
  protected readonly newField: WritableSignal<Nullable<NewFieldDraft>> =
    signal<Nullable<NewFieldDraft>>(null);
  protected readonly check: WritableSignal<FormulaCheck> = signal<FormulaCheck>(FormulaCheck.empty());
  protected readonly dirty: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.DATA_CONFIGURE),
  );
  protected readonly targetOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .derived()
      .filter((f: CatalogFieldView): boolean => f.active)
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly sourceOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .active()
      .filter(
        (f: CatalogFieldView): boolean =>
          f.nature === NumericNature.AMOUNT || f.nature === NumericNature.QUANTITY,
      )
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly insertOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .active()
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.label })),
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected labelOf(key: string): string {
    return this.catalog().labelOf(key);
  }

  protected kindLabel(kind: OperationKind): string {
    return OperationsView.kindLabel(kind);
  }

  protected describe(step: OperationStepDto): string {
    return FormulaCheck.describe(step, this.catalog());
  }

  protected open(step: Nullable<OperationStepDto>, index: number): void {
    const draft: StepDraft = step === null ? StepDraft.blank() : StepDraft.of(step, index);
    this.draft.set(draft);
    this.recheck(draft);
  }

  protected recheck(draft: StepDraft): void {
    this.check.set(
      draft.kind === OperationKind.CALCULATED
        ? FormulaCheck.of(draft.formula, this.catalog())
        : FormulaCheck.empty(),
    );
  }

  protected insert(draft: StepDraft, label: Nullable<string>): void {
    if (label === null) {
      return;
    }
    const spacer: string = draft.formula.endsWith('=') || draft.formula.endsWith(' ') ? '' : ' ';
    draft.formula = `${draft.formula}${spacer}[${label}]`;
    this.recheck(draft);
  }

  protected apply(): void {
    const draft: Nullable<StepDraft> = this.draft();
    if (draft === null) {
      return;
    }
    if (draft.targetKey === null) {
      this.notifier.info('Elige el encabezado destino');
      return;
    }
    if (draft.kind === OperationKind.CALCULATED && !this.check().ok) {
      this.notifier.info('Corrige la fórmula antes de aceptar');
      return;
    }
    if (draft.kind === OperationKind.YEAR_TO_DATE && draft.sourceKey === null) {
      this.notifier.info('Elige el encabezado que se acumula');
      return;
    }
    const step: OperationStepDto = draft.toStep(draft.targetKey);
    const index: Nullable<number> = draft.index;
    this.steps.update((steps: OperationStepDto[]): OperationStepDto[] =>
      index === null
        ? [...steps, step]
        : steps.map((s: OperationStepDto, i: number): OperationStepDto => (i === index ? step : s)),
    );
    this.dirty.set(true);
    this.draft.set(null);
  }

  protected move(index: number, delta: number): void {
    const target: number = index + delta;
    this.steps.update((steps: OperationStepDto[]): OperationStepDto[] => {
      if (target < 0 || target >= steps.length) {
        return steps;
      }
      return steps.map((s: OperationStepDto, i: number): OperationStepDto => {
        if (i === index) {
          return steps[target] ?? s;
        }
        return i === target ? (steps[index] ?? s) : s;
      });
    });
    this.dirty.set(true);
  }

  protected remove(index: number): void {
    this.steps.update((steps: OperationStepDto[]): OperationStepDto[] =>
      steps.filter((_s: OperationStepDto, i: number): boolean => i !== index),
    );
    this.dirty.set(true);
  }

  protected startNewField(): void {
    this.newField.set(new NewFieldDraft());
  }

  protected async createField(): Promise<void> {
    const field: Nullable<NewFieldDraft> = this.newField();
    const draft: Nullable<StepDraft> = this.draft();
    if (field === null || field.label.trim() === '') {
      return;
    }
    const result: Result<CatalogFieldView> = await this.api.addField(this.context.id(), {
      label: field.label,
      origin: FieldOrigin.DERIVED,
      role: FieldRole.DATA,
      dataType: field.dataType,
      nature: field.isNumeric() ? field.nature : null,
      aggregation: null,
      describes: null,
      weightField: null,
    });
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    await this.loadCatalog();
    if (draft !== null) {
      draft.targetKey = result.unwrap().key;
      this.draft.set(draft);
    }
    this.newField.set(null);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const result: Result<OperationsView> = await this.api.saveOperations(this.context.id(), {
      steps: this.steps(),
    });
    this.saving.set(false);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.steps.set(result.unwrap().steps);
    this.dirty.set(false);
    this.notifier.success('Operaciones guardadas');
  }

  private async load(): Promise<void> {
    const [operations] = await Promise.all([this.api.operations(this.context.id()), this.loadCatalog()]);
    operations.match(
      (view: OperationsView): void => this.steps.set(view.steps),
      (e): void => this.notifier.error(e),
    );
  }

  private async loadCatalog(): Promise<void> {
    (await this.api.fieldCatalog(this.context.id())).match(
      (c: CatalogView): void => this.catalog.set(c),
      (e): void => this.notifier.error(e),
    );
  }
}
