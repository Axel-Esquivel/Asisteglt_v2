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
  Aggregation,
  CatalogErrorCode,
  CatalogFieldRequest,
  CatalogTemplate,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
  ProjectPermission,
} from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Menu } from 'primeng/menu';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProjectContext } from '../../projects/data/project-context';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option, ReportsLabels } from '../data/reports-labels';

/** Borrador editable de un encabezado (todas las propiedades explícitas, sin opcionales). */
class FieldDraft {
  public constructor(
    public readonly key: Nullable<string>,
    public label: string,
    public origin: FieldOrigin,
    public role: FieldRole,
    public dataType: DataType,
    public nature: Nullable<NumericNature>,
    public aggregation: Nullable<Aggregation>,
    public describes: Nullable<string>,
    public weightField: Nullable<string>,
  ) {}

  public static blank(): FieldDraft {
    return new FieldDraft(
      null,
      '',
      FieldOrigin.IMPORTED,
      FieldRole.DATA,
      DataType.TEXT,
      null,
      null,
      null,
      null,
    );
  }

  public static of(field: CatalogFieldView): FieldDraft {
    const s = field.raw();
    return new FieldDraft(
      s.key,
      s.label,
      s.origin,
      s.role,
      s.dataType,
      s.nature,
      s.aggregation,
      s.describes,
      s.weightField,
    );
  }

  public isNumeric(): boolean {
    return this.dataType === DataType.INTEGER || this.dataType === DataType.DECIMAL;
  }

  public isWeighted(): boolean {
    return this.nature === NumericNature.RATE || this.nature === NumericNature.UNIT_PRICE;
  }

  public toRequest(): CatalogFieldRequest {
    const numeric: boolean = this.isNumeric() && this.role === FieldRole.DATA;
    return {
      label: this.label,
      origin: this.origin,
      role: this.role,
      dataType: this.dataType,
      nature: numeric ? this.nature : null,
      aggregation: numeric ? this.aggregation : null,
      describes: this.role === FieldRole.IDENTIFIER_NAME ? this.describes : null,
      weightField: numeric && this.isWeighted() ? this.weightField : null,
    };
  }
}

/** Catálogo de encabezados: nombres libres con rol, tipo y naturaleza (docs/12 §2). */
@Component({
  selector: 'app-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Button,
    Card,
    Dialog,
    FloatLabel,
    InputText,
    Menu,
    Message,
    Select,
    TableModule,
    Tag,
  ],
  templateUrl: './catalog.page.html',
  styleUrl: '../reports.scss',
})
export class CatalogPage implements OnInit {
  protected readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  protected readonly draft: WritableSignal<Nullable<FieldDraft>> = signal<Nullable<FieldDraft>>(null);
  protected readonly revision: WritableSignal<number> = signal<number>(0);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly labels: typeof ReportsLabels = ReportsLabels;
  protected readonly FieldRole: typeof FieldRole = FieldRole;
  protected readonly templateItems: MenuItem[] = [
    {
      label: 'Plantilla contable',
      icon: 'pi pi-book',
      command: (): void => this.applyTemplate(CatalogTemplate.ACCOUNTING),
    },
    {
      label: 'Plantilla de ventas',
      icon: 'pi pi-shopping-cart',
      command: (): void => this.applyTemplate(CatalogTemplate.SALES),
    },
  ];

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.DATA_CONFIGURE),
  );
  protected readonly identifierOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .identifiers()
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly weightOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .weightable()
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly aggregationOptions: Signal<Option<Aggregation>[]> = computed(
    (): Option<Aggregation>[] => {
      this.revision();
      const draft: Nullable<FieldDraft> = this.draft();
      const nature: Nullable<NumericNature> = draft === null ? null : draft.nature;
      const additive: boolean = nature === NumericNature.AMOUNT || nature === NumericNature.QUANTITY;
      const weighted: boolean = nature === NumericNature.RATE || nature === NumericNature.UNIT_PRICE;
      return ReportsLabels.AGGREGATIONS.filter((o: Option<Aggregation>): boolean =>
        additive
          ? o.value !== Aggregation.WEIGHTED_AVERAGE
          : weighted
            ? o.value !== Aggregation.SUM
            : o.value === Aggregation.NONE || o.value === Aggregation.COUNT,
      );
    },
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected touch(): void {
    this.revision.update((n: number): number => n + 1);
  }

  protected openNew(): void {
    this.draft.set(FieldDraft.blank());
  }

  protected openEdit(field: CatalogFieldView): void {
    this.draft.set(FieldDraft.of(field));
  }

  protected labelOf(key: Nullable<string>): string {
    return key === null ? '—' : this.catalog().labelOf(key);
  }

  protected async save(): Promise<void> {
    const draft: Nullable<FieldDraft> = this.draft();
    if (draft === null) {
      return;
    }
    this.saving.set(true);
    const result: Result<CatalogFieldView> =
      draft.key === null
        ? await this.api.addField(this.context.id(), draft.toRequest())
        : await this.api.redefineField(this.context.id(), draft.key, draft.toRequest());
    this.saving.set(false);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.draft.set(null);
    this.notifier.success('Encabezado guardado');
    await this.load();
  }

  protected confirmDeactivate(field: CatalogFieldView): void {
    this.confirmation.confirm({
      header: 'Desactivar encabezado',
      message: `¿Desactivar «${field.label}»? Su nombre quedará libre y las definiciones que lo usan dejarán de calcularse.`,
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.deactivate(field, false).catch((): void => {
          // Informado en deactivate.
        });
      },
    });
  }

  private async deactivate(field: CatalogFieldView, force: boolean): Promise<void> {
    const result: Result<CatalogFieldView> = await this.api.deactivateField(
      this.context.id(),
      field.key,
      force,
    );
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null && error.code === CatalogErrorCode.FIELD_IN_USE && !force) {
      this.confirmation.confirm({
        header: 'Encabezado en uso',
        message: `${error.message}. ¿Desactivarlo de todas formas?`,
        acceptLabel: 'Desactivar igualmente',
        rejectLabel: 'Cancelar',
        accept: (): void => {
          this.deactivate(field, true).catch((): void => {
            // Informado en deactivate.
          });
        },
      });
      return;
    }
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.notifier.success(`«${field.label}» desactivado`);
    await this.load();
  }

  private applyTemplate(template: CatalogTemplate): void {
    this.api
      .applyTemplate(this.context.id(), template)
      .then((result: Result<CatalogView>): void =>
        result.match(
          (catalog: CatalogView): void => {
            this.catalog.set(catalog);
            this.notifier.success('Plantilla aplicada; los nombres repetidos se omitieron');
          },
          (error): void => this.notifier.error(error),
        ),
      )
      .catch((): void => {
        // Informado arriba.
      });
  }

  private async load(): Promise<void> {
    const result: Result<CatalogView> = await this.api.fieldCatalog(this.context.id());
    result.match(
      (catalog: CatalogView): void => this.catalog.set(catalog),
      (error): void => this.notifier.error(error),
    );
  }
}
