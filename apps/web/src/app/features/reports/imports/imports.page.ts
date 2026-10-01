import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ImportItemRequest, OrgLevel, ProjectPermission, RealtimeEvent } from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier, RealtimeClient } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { FileSelectEvent, FileUpload } from 'primeng/fileupload';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { ProjectContext } from '../../projects/data/project-context';
import { CatalogView } from '../data/catalog.model';
import { ImportBatchView, ImportItemEventView, ImportItemView } from '../data/import.model';
import { OrgTree, OrgUnitView } from '../data/org.model';
import { ProfileView } from '../data/profile.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option } from '../data/reports-labels';
import { RowCheck, RowState, UploadRow } from './upload-row';

/** Ventana de carga múltiple con propiedades por archivo e historial en tiempo real (docs/12 §4). */
@Component({
  selector: 'app-imports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    Button,
    Card,
    Checkbox,
    DatePicker,
    FileUpload,
    Message,
    Select,
    TableModule,
    Tag,
    Tooltip,
  ],
  templateUrl: './imports.page.html',
  styleUrl: '../reports.scss',
})
export class ImportsPage implements OnInit {
  protected readonly rows: WritableSignal<UploadRow[]> = signal<UploadRow[]>([]);
  protected readonly history: WritableSignal<ImportBatchView[]> = signal<ImportBatchView[]>([]);
  protected readonly profiles: WritableSignal<ProfileView[]> = signal<ProfileView[]>([]);
  protected readonly org: WritableSignal<OrgTree> = signal<OrgTree>(OrgTree.empty());
  protected readonly uploading: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly OrgLevel: typeof OrgLevel = OrgLevel;

  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);

  protected readonly canLoad: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.DATA_LOAD),
  );
  protected readonly profileOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.profiles()
      .filter((p: ProfileView): boolean => p.isActive())
      .map((p: ProfileView): Option<string> => ({ label: p.name, value: p.id })),
  );
  protected readonly checks: Signal<ReadonlyMap<number, RowCheck>> = computed(
    (): ReadonlyMap<number, RowCheck> => {
      const rows: UploadRow[] = this.rows();
      const keys: Map<string, number> = new Map<string, number>();
      rows.forEach((r: UploadRow): void => {
        keys.set(r.scopeKey(), (keys.get(r.scopeKey()) ?? 0) + 1);
      });
      const checks: Map<number, RowCheck> = new Map<number, RowCheck>();
      for (const row of rows) {
        const missing: string[] = row.missing();
        const profile: Nullable<ProfileView> =
          this.profiles().find((p: ProfileView): boolean => p.id === row.profileId) ?? null;
        if (missing.length > 0) {
          checks.set(row.id, new RowCheck(RowState.ERROR, `Falta: ${missing.join(', ')}`));
        } else if (profile !== null && !profile.accepts(row.file.name)) {
          checks.set(row.id, new RowCheck(RowState.ERROR, `${profile.name} no acepta esta extensión`));
        } else if ((keys.get(row.scopeKey()) ?? 0) > 1) {
          checks.set(
            row.id,
            new RowCheck(RowState.ERROR, 'Duplica la preconfiguración, el período y el alcance de otra fila'),
          );
        } else {
          checks.set(row.id, row.quickCheck ?? new RowCheck(RowState.READY, 'Lista'));
        }
      }
      return checks;
    },
  );
  protected readonly readyCount: Signal<number> = computed(
    (): number =>
      [...this.checks().values()].filter((c: RowCheck): boolean => c.state !== RowState.ERROR).length,
  );
  protected readonly items: Signal<ImportItemView[]> = computed((): ImportItemView[] =>
    this.history().flatMap((b: ImportBatchView): ImportItemView[] => [...b.items]),
  );

  public constructor() {
    const destroyRef: DestroyRef = inject(DestroyRef);
    inject(RealtimeClient)
      .events(RealtimeEvent.IMPORT_ITEM, ImportItemEventView.decoder())
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((event: ImportItemEventView): void => {
        if (event.projectId === this.context.id()) {
          this.history.update((batches: ImportBatchView[]): ImportBatchView[] =>
            batches.map((b: ImportBatchView): ImportBatchView =>
              b.id === event.item.s.batchId ? b.withItem(event.item) : b,
            ),
          );
        }
      });
  }

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected children(parentId: Nullable<string>, level: OrgLevel): Option<string>[] {
    return this.org()
      .children(parentId, level)
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id }));
  }

  protected currencies(countryId: Nullable<string>): Option<string>[] {
    return this.org()
      .currencies(countryId)
      .map((c: string): Option<string> => ({ label: c, value: c }));
  }

  protected check(row: UploadRow): RowCheck {
    return this.checks().get(row.id) ?? new RowCheck(RowState.ERROR, '');
  }

  protected async onFiles(event: FileSelectEvent, upload: FileUpload): Promise<void> {
    const added: UploadRow[] = event.currentFiles.map((file: File): UploadRow => {
      const row: UploadRow = new UploadRow(file);
      row.autofill(this.profiles(), this.org());
      return row;
    });
    upload.clear();
    this.rows.update((rows: UploadRow[]): UploadRow[] => [...rows, ...added]);
    await Promise.all(added.map((row: UploadRow): Promise<void> => this.verify(row)));
    this.refresh();
  }

  /** Notifica a la vista que una fila cambió (las filas son objetos mutables enlazados con ngModel). */
  protected changed(row: UploadRow): void {
    row.cascade(this.org());
    row.quickCheck = null;
    this.refresh();
    this.verify(row)
      .then((): void => this.refresh())
      .catch((): void => {
        // La verificación rápida es orientativa.
      });
  }

  protected copyPrevious(): void {
    const rows: UploadRow[] = this.rows();
    rows.forEach((row: UploadRow, index: number): void => {
      const previous: Nullable<UploadRow> = index > 0 ? (rows[index - 1] ?? null) : null;
      if (row.selected && previous !== null) {
        row.copyFrom(previous);
      }
    });
    this.refresh();
  }

  protected applyFirstToSelected(): void {
    const selected: UploadRow[] = this.rows().filter((r: UploadRow): boolean => r.selected);
    const first: Nullable<UploadRow> = selected[0] ?? null;
    if (first !== null) {
      selected.slice(1).forEach((row: UploadRow): void => row.copyFrom(first));
    }
    this.refresh();
  }

  protected removeSelected(): void {
    this.rows.update((rows: UploadRow[]): UploadRow[] => rows.filter((r: UploadRow): boolean => !r.selected));
  }

  protected remove(row: UploadRow): void {
    this.rows.update((rows: UploadRow[]): UploadRow[] =>
      rows.filter((r: UploadRow): boolean => r.id !== row.id),
    );
  }

  protected async submit(): Promise<void> {
    const ready: UploadRow[] = this.rows().filter(
      (r: UploadRow): boolean => this.check(r).state !== RowState.ERROR,
    );
    const items: ImportItemRequest[] = ready
      .map((r: UploadRow): Nullable<ImportItemRequest> => r.request())
      .filter((r: Nullable<ImportItemRequest>): r is ImportItemRequest => r !== null);
    if (items.length === 0) {
      return;
    }
    this.uploading.set(true);
    const result: Result<ImportBatchView> = await this.api.submitImport(
      this.context.id(),
      { items },
      ready.map((r: UploadRow): File => r.file),
    );
    this.uploading.set(false);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    const sent: Set<number> = new Set<number>(ready.map((r: UploadRow): number => r.id));
    this.rows.update((rows: UploadRow[]): UploadRow[] =>
      rows.filter((r: UploadRow): boolean => !sent.has(r.id)),
    );
    this.history.update((batches: ImportBatchView[]): ImportBatchView[] => [result.unwrap(), ...batches]);
    this.notifier.success(
      `Se enviaron ${String(items.length)} archivos; la extracción continúa en segundo plano`,
    );
  }

  protected orgName(id: Nullable<string>): string {
    return this.org().nameOf(id);
  }

  private refresh(): void {
    this.rows.update((rows: UploadRow[]): UploadRow[] => [...rows]);
  }

  private async verify(row: UploadRow): Promise<void> {
    const profile: Nullable<ProfileView> =
      this.profiles().find((p: ProfileView): boolean => p.id === row.profileId) ?? null;
    if (profile !== null) {
      await row.verify(profile, this.catalog());
    }
  }

  private async load(): Promise<void> {
    const projectId: string = this.context.id();
    const [profiles, org, catalog, history] = await Promise.all([
      this.api.profileList(projectId),
      this.api.orgStructure(projectId),
      this.api.fieldCatalog(projectId),
      this.api.importHistory(projectId),
    ]);
    profiles.match(
      (items: ProfileView[]): void => this.profiles.set(items),
      (error): void => this.notifier.error(error),
    );
    org.match(
      (tree: OrgTree): void => this.org.set(tree),
      (error): void => this.notifier.error(error),
    );
    catalog.match(
      (value: CatalogView): void => this.catalog.set(value),
      (error): void => this.notifier.error(error),
    );
    history.match(
      (batches: ImportBatchView[]): void => this.history.set(batches),
      (): void => {
        // Sin permiso de ver datos: el historial queda vacío.
      },
    );
  }
}
