import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InputSignal,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  AssignmentResponse,
  InventoryItemRequest,
  ItemCondition,
  ItemStatusResponse,
  ParticipantDto,
  ParticipantRole,
  ProjectPermission,
  ProjectRole,
  RealtimeEvent,
  WorkItemResponse,
} from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier, RealtimeClient } from '@asisteglt/web-core';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FileSelectEvent, FileUpload } from 'primeng/fileupload';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Dialog } from 'primeng/dialog';
import { Tooltip } from 'primeng/tooltip';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { ProjectContext } from '../../projects/data/project-context';
import { ProjectMemberView } from '../../projects/data/project.model';
import { ProjectsApiClient } from '../../projects/data/projects.api-client';
import { InventoryApiClient } from '../data/inventory.api-client';
import { CountView, InventoryEventView, MyWork, Supervision } from '../data/inventory.model';
import { EntryDraft } from '../data/entry-draft';
import { ItemMapping, ItemSheet } from '../data/item-sheet';

interface MemberChoice {
  readonly member: ProjectMemberView;
  role: Nullable<ParticipantRole>;
}

interface Option<T> {
  readonly label: string;
  readonly value: T;
}

/** Toma física: configuración, «Mi conteo» (a ciegas) y supervisión en vivo con rondas. */
@Component({
  selector: 'app-count-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Button,
    Card,
    FileUpload,
    InputText,
    Message,
    ProgressBar,
    Select,
    SelectButton,
    Dialog,
    Tooltip,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    TableModule,
    Tag,
    ToggleSwitch,
  ],
  templateUrl: './count.page.html',
  styleUrl: '../inventory.scss',
})
export class CountPage implements OnInit {
  public readonly countId: InputSignal<string> = input.required<string>();

  protected readonly count: WritableSignal<Nullable<CountView>> = signal<Nullable<CountView>>(null);
  protected readonly work: WritableSignal<Nullable<MyWork>> = signal<Nullable<MyWork>>(null);
  protected readonly supervision: WritableSignal<Nullable<Supervision>> = signal<Nullable<Supervision>>(null);
  protected readonly sheet: WritableSignal<Nullable<ItemSheet>> = signal<Nullable<ItemSheet>>(null);
  protected readonly mapping: WritableSignal<ItemMapping> = signal<ItemMapping>({
    sku: null,
    description: null,
    unit: null,
    location: null,
    quantity: null,
    cost: null,
  });
  protected readonly members: WritableSignal<MemberChoice[]> = signal<MemberChoice[]>([]);
  protected readonly conditions: Option<ItemCondition>[] = [
    { label: 'Bien', value: ItemCondition.OK },
    { label: 'No está', value: ItemCondition.NOT_FOUND },
    { label: 'Dañado', value: ItemCondition.DAMAGED },
  ];
  protected readonly notFound: ItemCondition = ItemCondition.NOT_FOUND;
  protected readonly reassignFrom: WritableSignal<Nullable<AssignmentResponse>> =
    signal<Nullable<AssignmentResponse>>(null);
  protected readonly reassignTo: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly reassignOptions: Signal<Option<string>[]> = computed((): Option<string>[] => {
    const from: Nullable<AssignmentResponse> = this.reassignFrom();
    return this.assignments()
      .filter((a: AssignmentResponse): boolean => from === null || a.userId !== from.userId)
      .map((a: AssignmentResponse): Option<string> => ({ label: a.displayName, value: a.userId }));
  });
  protected readonly drafts: WritableSignal<ReadonlyMap<string, EntryDraft>> = signal<
    ReadonlyMap<string, EntryDraft>
  >(new Map<string, EntryDraft>());
  protected readonly onlyDifferences: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly tab: WritableSignal<string> = signal<string>('');
  protected readonly roleOptions: Option<Nullable<ParticipantRole>>[] = [
    { label: 'Contador', value: ParticipantRole.COUNTER },
    { label: 'Supervisor', value: ParticipantRole.SUPERVISOR },
    { label: 'No participa', value: null },
  ];
  protected readonly mappingRoles: { readonly key: keyof ItemMapping; readonly label: string }[] = [
    { key: 'sku', label: 'SKU' },
    { key: 'description', label: 'Descripción' },
    { key: 'unit', label: 'Unidad' },
    { key: 'location', label: 'Ubicación' },
    { key: 'quantity', label: 'Existencia (sistema)' },
    { key: 'cost', label: 'Costo unitario' },
  ];

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: InventoryApiClient = inject(InventoryApiClient);
  private readonly projects: ProjectsApiClient = inject(ProjectsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.INVENTORY_CONFIGURE),
  );
  protected readonly canCount: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.INVENTORY_COUNT),
  );
  protected readonly canView: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.INVENTORY_VIEW),
  );
  protected readonly canSupervise: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.INVENTORY_SUPERVISE),
  );
  protected readonly columnOptions: Signal<Option<number>[]> = computed((): Option<number>[] => {
    const sheet: Nullable<ItemSheet> = this.sheet();
    return sheet === null
      ? []
      : sheet.headers.map((h: string, i: number): Option<number> => ({
          label: h === '' ? `Columna ${String(i + 1)}` : h,
          value: i,
        }));
  });
  protected readonly sheetItems: Signal<InventoryItemRequest[]> = computed((): InventoryItemRequest[] => {
    const sheet: Nullable<ItemSheet> = this.sheet();
    return sheet === null ? [] : sheet.items(this.mapping());
  });
  protected readonly visibleItems: Signal<ItemStatusResponse[]> = computed((): ItemStatusResponse[] => {
    const supervision: Nullable<Supervision> = this.supervision();
    const items: ItemStatusResponse[] = supervision === null ? [] : supervision.items;
    return this.onlyDifferences()
      ? items.filter(
          (i: ItemStatusResponse): boolean =>
            (i.difference !== null && i.difference !== '0') ||
            (i.condition !== null && i.condition !== ItemCondition.OK),
        )
      : items;
  });
  protected readonly assignments: Signal<AssignmentResponse[]> = computed((): AssignmentResponse[] => {
    const count: Nullable<CountView> = this.count();
    const round = count === null ? null : count.currentRound();
    return round === null ? [] : [...round.assignments];
  });
  protected readonly workProgress: Signal<number> = computed((): number => {
    const work: Nullable<MyWork> = this.work();
    return work === null || work.s.items.length === 0
      ? 0
      : Math.round((work.done() * 100) / work.s.items.length);
  });

  public constructor() {
    const destroyRef: DestroyRef = inject(DestroyRef);
    inject(RealtimeClient)
      .events(RealtimeEvent.INVENTORY_CHANGED, InventoryEventView.decoder())
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((event: InventoryEventView): void => {
        if (event.countId === this.countId()) {
          this.refresh().catch((): void => {
            // Se reintenta con el siguiente evento.
          });
        }
      });
  }

  public ngOnInit(): void {
    this.refresh()
      .then((): void => this.tab.set(this.defaultTab()))
      .catch((): void => {
        // Informado en refresh.
      });
    if (this.canConfigure()) {
      this.loadMembers().catch((): void => {
        // Informado en loadMembers.
      });
    }
  }

  protected setMapping(key: keyof ItemMapping, value: Nullable<number>): void {
    this.mapping.update((m: ItemMapping): ItemMapping => ({ ...m, [key]: value }));
  }

  protected async onItemsFile(event: FileSelectEvent): Promise<void> {
    const file: Nullable<File> = event.currentFiles[0] ?? null;
    if (file !== null) {
      const sheet: ItemSheet = ItemSheet.parse(await file.text());
      this.sheet.set(sheet);
      this.mapping.set(sheet.guess());
    }
  }

  protected async uploadItems(): Promise<void> {
    await this.apply(
      this.api.replaceItems(this.context.id(), this.countId(), this.sheetItems()),
      `${String(this.sheetItems().length)} ítems cargados`,
    );
    this.sheet.set(null);
  }

  protected async saveParticipants(): Promise<void> {
    const participants: ParticipantDto[] = this.members()
      .filter((m: MemberChoice): boolean => m.role !== null)
      .map((m: MemberChoice): ParticipantDto => ({
        userId: m.member.userId,
        role: m.role ?? ParticipantRole.COUNTER,
      }));
    await this.apply(
      this.api.setParticipants(this.context.id(), this.countId(), participants),
      'Participantes guardados',
    );
  }

  protected act(
    action: 'start' | 'rounds/close' | 'recount' | 'close',
    message: string,
    confirm: string,
  ): void {
    this.confirmation.confirm({
      header: 'Confirmar',
      message: confirm,
      acceptLabel: 'Continuar',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.apply(this.api.action(this.context.id(), this.countId(), action), message)
          .then((): void => this.tab.set(this.defaultTab()))
          .catch((): void => {
            // Informado en apply.
          });
      },
    });
  }

  protected draftOf(item: WorkItemResponse): EntryDraft {
    return this.drafts().get(item.itemId) ?? EntryDraft.of(item);
  }

  protected setDraft(item: WorkItemResponse, change: (draft: EntryDraft) => EntryDraft): void {
    const next: EntryDraft = change(this.draftOf(item));
    this.drafts.update(
      (d: ReadonlyMap<string, EntryDraft>): ReadonlyMap<string, EntryDraft> =>
        new Map<string, EntryDraft>([...d, [item.itemId, next]]),
    );
  }

  protected setQuantity(item: WorkItemResponse, value: string): void {
    this.setDraft(item, (d: EntryDraft): EntryDraft => d.withQuantity(value));
  }

  protected setCondition(item: WorkItemResponse, value: ItemCondition): void {
    this.setDraft(item, (d: EntryDraft): EntryDraft => d.withCondition(value));
  }

  protected setComment(item: WorkItemResponse, value: string): void {
    this.setDraft(item, (d: EntryDraft): EntryDraft => d.withComment(value));
  }

  protected conditionLabel(condition: Nullable<ItemCondition>): string {
    return Supervision.conditionLabel(condition);
  }

  protected openReassign(assignment: AssignmentResponse): void {
    this.reassignFrom.set(assignment);
    this.reassignTo.set(null);
  }

  protected async reassign(): Promise<void> {
    const from: Nullable<AssignmentResponse> = this.reassignFrom();
    const to: Nullable<string> = this.reassignTo();
    if (from === null || to === null) {
      return;
    }
    await this.apply(
      this.api.reassign(this.context.id(), this.countId(), { fromUserId: from.userId, toUserId: to }),
      `Pendientes de ${from.displayName} reasignados`,
    );
    this.reassignFrom.set(null);
  }

  protected exportCsv(): void {
    const supervision: Nullable<Supervision> = this.supervision();
    const count: Nullable<CountView> = this.count();
    if (supervision === null || count === null) {
      return;
    }
    const blob: Blob = new Blob([`\uFEFF${supervision.toCsv()}`], { type: 'text/csv;charset=utf-8' });
    const url: string = URL.createObjectURL(blob);
    const link: HTMLAnchorElement = document.createElement('a');
    link.href = url;
    link.download = `${count.s.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}_resultados.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected async record(item: WorkItemResponse): Promise<void> {
    const draft: EntryDraft = this.draftOf(item);
    if (!draft.isComplete()) {
      return;
    }
    const result: Result<true> = await this.api.record(
      this.context.id(),
      this.countId(),
      draft.toRequest(item.itemId),
    );
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    await this.refresh();
  }

  protected percent(counted: number, assigned: number): number {
    return assigned === 0 ? 0 : Math.round((counted * 100) / assigned);
  }

  private defaultTab(): string {
    const count: Nullable<CountView> = this.count();
    if (count !== null && count.isDraft() && this.canConfigure()) {
      return 'config';
    }
    if (this.canCount() && !this.canView()) {
      return 'work';
    }
    return this.canView() ? 'supervision' : 'work';
  }

  private async apply(request: Promise<Result<CountView>>, message: string): Promise<void> {
    const result: Result<CountView> = await request;
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.notifier.success(message);
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const count: Result<CountView> = await this.api.find(this.context.id(), this.countId());
    count.match(
      (c: CountView): void => this.count.set(c),
      (e): void => this.notifier.error(e),
    );
    if (this.canCount()) {
      const work: Result<MyWork> = await this.api.myWork(this.context.id(), this.countId());
      work.match(
        (w: MyWork): void => this.work.set(w),
        (): void => this.work.set(null),
      );
    }
    if (this.canView()) {
      const supervision: Result<Supervision> = await this.api.supervision(this.context.id(), this.countId());
      supervision.match(
        (s: Supervision): void => this.supervision.set(s),
        (): void => this.supervision.set(null),
      );
    }
  }

  private async loadMembers(): Promise<void> {
    const result: Result<ProjectMemberView[]> = await this.projects.memberList(this.context.id());
    result.match(
      (members: ProjectMemberView[]): void => {
        const current: Nullable<CountView> = this.count();
        const chosen: ReadonlyMap<string, ParticipantRole> = new Map<string, ParticipantRole>(
          current === null
            ? []
            : current.s.participants.map((p: ParticipantDto): [string, ParticipantRole] => [
                p.userId,
                p.role,
              ]),
        );
        this.members.set(
          members.map((member: ProjectMemberView): MemberChoice => ({
            member,
            role:
              chosen.get(member.userId) ??
              (member.role === ProjectRole.COUNTER
                ? ParticipantRole.COUNTER
                : member.role === ProjectRole.AUDITOR
                  ? null
                  : ParticipantRole.SUPERVISOR),
          })),
        );
      },
      (e): void => this.notifier.error(e),
    );
  }
}
