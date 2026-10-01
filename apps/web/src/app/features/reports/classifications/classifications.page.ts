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
import { ClassificationNodeDto, ProjectPermission } from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { ConfirmationService, TreeNode } from 'primeng/api';
import { AutoComplete } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { TreeTableModule } from 'primeng/treetable';
import { ProjectContext } from '../../projects/data/project-context';
import { ClassificationView } from '../data/analysis.model';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option } from '../data/reports-labels';

interface NodeDraft {
  readonly id: Nullable<string>;
  readonly parentId: Nullable<string>;
  code: string;
  name: string;
  patterns: string[];
}

/** Clasificaciones: árbol de nodos sobre un identificador con patrones de asignación (`1.*`, `2.001.*`). */
@Component({
  selector: 'app-classifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    AutoComplete,
    Button,
    Card,
    Dialog,
    FloatLabel,
    InputText,
    Message,
    Select,
    TableModule,
    Tag,
    TreeTableModule,
  ],
  templateUrl: './classifications.page.html',
  styleUrl: '../reports.scss',
})
export class ClassificationsPage implements OnInit {
  protected readonly list: WritableSignal<ClassificationView[]> = signal<ClassificationView[]>([]);
  protected readonly selectedId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly editing: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly name: WritableSignal<string> = signal<string>('');
  protected readonly fieldKey: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly nodes: WritableSignal<ClassificationNodeDto[]> = signal<ClassificationNodeDto[]>([]);
  protected readonly nodeDraft: WritableSignal<Nullable<NodeDraft>> = signal<Nullable<NodeDraft>>(null);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);

  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.DATA_CONFIGURE),
  );
  protected readonly fieldOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .active()
      .filter((f: CatalogFieldView): boolean => f.isClassifiable())
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );
  protected readonly tree: Signal<TreeNode<ClassificationNodeDto>[]> = computed(
    (): TreeNode<ClassificationNodeDto>[] => this.children(this.nodes(), null),
  );

  protected readonly selectedItem: Signal<Nullable<ClassificationView>> = computed(
    (): Nullable<ClassificationView> =>
      this.list().find((item: ClassificationView): boolean => item.id === this.selectedId()) ?? null,
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected labelOf(key: string): string {
    return this.catalog().labelOf(key);
  }

  protected select(id: Nullable<string>): void {
    const found: Nullable<ClassificationView> =
      this.list().find((c: ClassificationView): boolean => c.id === id) ?? null;
    this.selectedId.set(id);
    this.editing.set(found !== null);
    if (found !== null) {
      this.name.set(found.name);
      this.fieldKey.set(found.fieldKey);
      this.nodes.set([...found.nodes]);
    }
  }

  protected startNew(): void {
    this.selectedId.set(null);
    this.name.set('');
    this.fieldKey.set(null);
    this.nodes.set([]);
    this.editing.set(true);
  }

  protected openNode(parent: Nullable<ClassificationNodeDto>, node: Nullable<ClassificationNodeDto>): void {
    this.nodeDraft.set(
      node === null
        ? { id: null, parentId: parent === null ? null : parent.id, code: '', name: '', patterns: [] }
        : {
            id: node.id,
            parentId: node.parentId,
            code: node.code,
            name: node.name,
            patterns: [...node.patterns],
          },
    );
  }

  protected applyNode(): void {
    const draft: Nullable<NodeDraft> = this.nodeDraft();
    if (draft === null || draft.name.trim() === '') {
      return;
    }
    const node: ClassificationNodeDto = {
      id: draft.id ?? `n${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`,
      parentId: draft.parentId,
      code: draft.code,
      name: draft.name,
      patterns: draft.patterns,
    };
    this.nodes.update((nodes: ClassificationNodeDto[]): ClassificationNodeDto[] =>
      draft.id === null
        ? [...nodes, node]
        : nodes.map((n: ClassificationNodeDto): ClassificationNodeDto => (n.id === node.id ? node : n)),
    );
    this.nodeDraft.set(null);
  }

  protected removeNode(node: ClassificationNodeDto): void {
    const doomed: Set<string> = new Set<string>([node.id]);
    let grew: boolean = true;
    while (grew) {
      grew = false;
      for (const n of this.nodes()) {
        if (n.parentId !== null && doomed.has(n.parentId) && !doomed.has(n.id)) {
          doomed.add(n.id);
          grew = true;
        }
      }
    }
    this.nodes.update((nodes: ClassificationNodeDto[]): ClassificationNodeDto[] =>
      nodes.filter((n: ClassificationNodeDto): boolean => !doomed.has(n.id)),
    );
  }

  protected async save(): Promise<void> {
    const fieldKey: Nullable<string> = this.fieldKey();
    if (fieldKey === null) {
      this.notifier.info('Elige el encabezado por el que se clasifica');
      return;
    }
    this.saving.set(true);
    const result: Result<ClassificationView> = await this.api.saveClassification(
      this.context.id(),
      this.selectedId(),
      {
        name: this.name(),
        fieldKey,
        nodes: this.nodes(),
      },
    );
    this.saving.set(false);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.notifier.success('Clasificación guardada');
    await this.load();
    this.select(result.unwrap().id);
  }

  protected confirmDelete(): void {
    const id: Nullable<string> = this.selectedId();
    if (id === null) {
      return;
    }
    this.confirmation.confirm({
      header: 'Eliminar clasificación',
      message: `¿Eliminar «${this.name()}»?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.api
          .deleteClassification(this.context.id(), id)
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

  private children(
    nodes: ReadonlyArray<ClassificationNodeDto>,
    parentId: Nullable<string>,
  ): TreeNode<ClassificationNodeDto>[] {
    return nodes
      .filter((n: ClassificationNodeDto): boolean => n.parentId === parentId)
      .map((n: ClassificationNodeDto): TreeNode<ClassificationNodeDto> => ({
        key: n.id,
        data: n,
        expanded: true,
        children: this.children(nodes, n.id),
      }));
  }

  private async load(): Promise<void> {
    const [list, catalog] = await Promise.all([
      this.api.classificationList(this.context.id()),
      this.api.fieldCatalog(this.context.id()),
    ]);
    list.match(
      (items: ClassificationView[]): void => this.list.set(items),
      (e): void => this.notifier.error(e),
    );
    catalog.match(
      (c: CatalogView): void => this.catalog.set(c),
      (e): void => this.notifier.error(e),
    );
  }
}
