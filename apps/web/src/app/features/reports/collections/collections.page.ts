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
  CollectionFieldDto,
  CollectionRowDto,
  DataType,
  NumericNature,
  ProjectPermission,
} from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { ProjectContext } from '../../projects/data/project-context';
import { CollectionView } from '../data/collections.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option, ReportsLabels } from '../data/reports-labels';

/** Campo editable; la clave se genera en el navegador para que las filas puedan usarla al instante. */
class CollectionFieldDraft {
  private static readonly ALPHABET: string = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  public constructor(
    public readonly key: string,
    public label: string,
    public dataType: DataType,
    public nature: Nullable<NumericNature>,
  ) {}

  public static blank(taken: ReadonlyArray<string>): CollectionFieldDraft {
    let key: string = '';
    while (key === '' || taken.includes(key)) {
      key = 'c_';
      for (let i: number = 0; i < 4; i += 1) {
        key += CollectionFieldDraft.ALPHABET.charAt(
          Math.floor(Math.random() * CollectionFieldDraft.ALPHABET.length),
        );
      }
    }
    return new CollectionFieldDraft(key, '', DataType.DECIMAL, NumericNature.RATE);
  }

  public isNumeric(): boolean {
    return this.dataType === DataType.DECIMAL || this.dataType === DataType.INTEGER;
  }

  public isBoolean(): boolean {
    return this.dataType === DataType.BOOLEAN;
  }

  public toDto(): CollectionFieldDto {
    return {
      key: this.key,
      label: this.label,
      dataType: this.dataType,
      nature: this.isNumeric() ? this.nature : null,
    };
  }
}

/** Fila editable: los valores se capturan como texto (o sí/no) y la API los valida por tipo. */
class CollectionRowDraft {
  public constructor(
    public readonly id: string,
    public period: string,
    public readonly text: Record<string, string>,
    public readonly flags: Record<string, boolean>,
  ) {}

  public static of(row: CollectionRowDto): CollectionRowDraft {
    const text: Record<string, string> = {};
    const flags: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(row.values)) {
      if (typeof value === 'boolean') {
        flags[key] = value;
      } else {
        text[key] = value ?? '';
      }
    }
    return new CollectionRowDraft(row.id, row.period ?? '', text, flags);
  }

  public toDto(fields: ReadonlyArray<CollectionFieldDraft>): CollectionRowDto {
    const values: Record<string, string | boolean | null> = {};
    for (const field of fields) {
      values[field.key] = field.isBoolean()
        ? (this.flags[field.key] ?? false)
        : (this.text[field.key] ?? '').trim();
    }
    return { id: this.id, period: this.period.trim() === '' ? null : this.period.trim(), values };
  }
}

/** Colecciones complementarias: campos propios (p. ej. *Moneda*, *Tasa de cierre*) y filas por período. */
@Component({
  selector: 'app-collections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Card, FloatLabel, InputText, Message, Select, TableModule, ToggleSwitch],
  templateUrl: './collections.page.html',
  styleUrl: '../reports.scss',
})
export class CollectionsPage implements OnInit {
  protected readonly types: Option<DataType>[] = ReportsLabels.TYPES;
  protected readonly natures: Option<NumericNature>[] = ReportsLabels.NATURES;

  protected readonly list: WritableSignal<CollectionView[]> = signal<CollectionView[]>([]);
  protected readonly selectedId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly editing: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly name: WritableSignal<string> = signal<string>('');
  protected readonly fields: WritableSignal<CollectionFieldDraft[]> = signal<CollectionFieldDraft[]>([]);
  protected readonly rows: WritableSignal<CollectionRowDraft[]> = signal<CollectionRowDraft[]>([]);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.DATA_CONFIGURE),
  );
  protected readonly selectedItem: Signal<Nullable<CollectionView>> = computed(
    (): Nullable<CollectionView> =>
      this.list().find((c: CollectionView): boolean => c.id === this.selectedId()) ?? null,
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected select(id: Nullable<string>): void {
    const found: Nullable<CollectionView> =
      this.list().find((c: CollectionView): boolean => c.id === id) ?? null;
    this.selectedId.set(id);
    this.editing.set(found !== null);
    if (found !== null) {
      this.name.set(found.name);
      this.fields.set(
        found.fields.map(
          (f: CollectionFieldDto): CollectionFieldDraft =>
            new CollectionFieldDraft(f.key, f.label, f.dataType, f.nature),
        ),
      );
      this.rows.set(found.rows.map((r: CollectionRowDto): CollectionRowDraft => CollectionRowDraft.of(r)));
    }
  }

  protected startNew(): void {
    this.selectedId.set(null);
    this.name.set('');
    this.fields.set([]);
    this.rows.set([]);
    this.editing.set(true);
  }

  protected addField(): void {
    this.fields.update((fields: CollectionFieldDraft[]): CollectionFieldDraft[] => [
      ...fields,
      CollectionFieldDraft.blank(fields.map((f: CollectionFieldDraft): string => f.key)),
    ]);
  }

  protected removeField(index: number): void {
    this.fields.update((fields: CollectionFieldDraft[]): CollectionFieldDraft[] =>
      fields.filter((_f: CollectionFieldDraft, i: number): boolean => i !== index),
    );
  }

  protected addRow(): void {
    this.rows.update((rows: CollectionRowDraft[]): CollectionRowDraft[] => [
      ...rows,
      new CollectionRowDraft(`r${String(Date.now())}${String(rows.length)}`, '', {}, {}),
    ]);
  }

  protected removeRow(index: number): void {
    this.rows.update((rows: CollectionRowDraft[]): CollectionRowDraft[] =>
      rows.filter((_r: CollectionRowDraft, i: number): boolean => i !== index),
    );
  }

  /** Fuerza el redibujado de las columnas de filas al cambiar el tipo o el nombre de un campo. */
  protected touchFields(): void {
    this.fields.update((fields: CollectionFieldDraft[]): CollectionFieldDraft[] => [...fields]);
  }

  protected async save(): Promise<void> {
    const fields: CollectionFieldDraft[] = this.fields();
    this.saving.set(true);
    const result: Result<CollectionView> = await this.api.saveCollection(
      this.context.id(),
      this.selectedId(),
      {
        name: this.name(),
        fields: fields.map((f: CollectionFieldDraft): CollectionFieldDto => f.toDto()),
        rows: this.rows().map((r: CollectionRowDraft): CollectionRowDto => r.toDto(fields)),
      },
    );
    this.saving.set(false);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.notifier.success('Colección guardada');
    await this.load();
    this.select(result.unwrap().id);
  }

  protected confirmDelete(): void {
    const id: Nullable<string> = this.selectedId();
    if (id === null) {
      return;
    }
    this.confirmation.confirm({
      header: 'Eliminar colección',
      message: `¿Eliminar «${this.name()}»?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.api
          .deleteCollection(this.context.id(), id)
          .then(async (result: Result<true>): Promise<void> => {
            const error: Nullable<DomainError> = result.errorOrNull();
            if (error !== null) {
              this.notifier.error(error);
              return;
            }
            this.editing.set(false);
            this.selectedId.set(null);
            await this.load();
          })
          .catch((): void => {
            // Informado arriba.
          });
      },
    });
  }

  private async load(): Promise<void> {
    (await this.api.collections(this.context.id())).match(
      (items: CollectionView[]): void => this.list.set(items),
      (e): void => this.notifier.error(e),
    );
  }
}
