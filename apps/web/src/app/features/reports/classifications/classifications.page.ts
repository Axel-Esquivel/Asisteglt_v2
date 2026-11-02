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
import { AutoComplete, AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { TreeTableModule } from 'primeng/treetable';
import { ProjectContext } from '../../projects/data/project-context';
import { ClassifiableValue, ClassifiableValues, ClassificationView } from '../data/analysis.model';
import { CatalogFieldView, CatalogView } from '../data/catalog.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option } from '../data/reports-labels';
import { ClassificationCoverage } from './classification-coverage';

interface NodeDraft {
  readonly id: Nullable<string>;
  readonly parentId: Nullable<string>;
  code: string;
  name: string;
  /** Patrones con comodines (o valores escritos a mano). */
  patterns: string[];
  /** Cuentas exactas elegidas de los datos. */
  accounts: ClassifiableValue[];
}

interface PendingSummary {
  readonly missing: number;
  readonly fresh: number;
}

/**
 * Clasificaciones: árbol de nodos sobre un identificador. Cada nodo asigna valores con patrones
 * (`1.*`, `2.001.*`) y con cuentas exactas elegidas de los datos publicados; las cuentas que ningún
 * nodo captura (incluidas las nuevas de cada carga) se listan para asignarlas en lote.
 */
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
    ToggleSwitch,
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
  protected readonly accountSuggestions: WritableSignal<ClassifiableValue[]> = signal<ClassifiableValue[]>(
    [],
  );
  protected readonly accountQuery: WritableSignal<Nullable<ClassifiableValue>> =
    signal<Nullable<ClassifiableValue>>(null);
  protected readonly pendingQuery: WritableSignal<string> = signal<string>('');
  protected readonly onlyNew: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly pendingSelection: WritableSignal<ClassifiableValue[]> = signal<ClassifiableValue[]>([]);
  protected readonly targetNodeId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly valuesLoading: WritableSignal<boolean> = signal<boolean>(false);

  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  private readonly valuesByField: WritableSignal<ReadonlyMap<string, ClassifiableValues>> = signal<
    ReadonlyMap<string, ClassifiableValues>
  >(new Map<string, ClassifiableValues>());
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

  protected readonly values: Signal<ClassifiableValues> = computed((): ClassifiableValues => {
    const key: Nullable<string> = this.fieldKey();
    return key === null
      ? ClassifiableValues.empty('')
      : (this.valuesByField().get(key) ?? ClassifiableValues.empty(key));
  });
  protected readonly coverage: Signal<ClassificationCoverage> = computed(
    (): ClassificationCoverage => new ClassificationCoverage(this.nodes(), this.values()),
  );
  protected readonly newPending: Signal<ClassifiableValue[]> = computed((): ClassifiableValue[] =>
    this.coverage().newUnclassified(),
  );
  protected readonly pendingRows: Signal<ClassifiableValue[]> = computed((): ClassifiableValue[] => {
    const words: string[] = this.pendingQuery()
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string): boolean => w.length > 0);
    const values: ClassifiableValues = this.values();
    const onlyNew: boolean = this.onlyNew();
    return this.coverage()
      .unclassified()
      .filter((v: ClassifiableValue): boolean => (!onlyNew || values.isNew(v)) && v.matches(words));
  });
  protected readonly nodeOptions: Signal<Option<string>[]> = computed((): Option<string>[] => {
    const options: Option<string>[] = [];
    const visit = (parentId: Nullable<string>, level: number): void => {
      for (const n of this.nodes().filter((x: ClassificationNodeDto): boolean => x.parentId === parentId)) {
        options.push({ label: `${'· '.repeat(level)}${ClassificationsPage.nodeLabel(n)}`, value: n.id });
        visit(n.id, level + 1);
      }
    };
    visit(null, 0);
    return options;
  });
  /** Cuentas sin clasificar de cada clasificación guardada (según los datos ya cargados). */
  protected readonly pendingByClassification: Signal<ReadonlyMap<string, PendingSummary>> = computed(
    (): ReadonlyMap<string, PendingSummary> => {
      const summary: Map<string, PendingSummary> = new Map<string, PendingSummary>();
      for (const item of this.list()) {
        const values: Nullable<ClassifiableValues> = this.valuesByField().get(item.fieldKey) ?? null;
        if (values !== null) {
          const coverage: ClassificationCoverage = new ClassificationCoverage(item.nodes, values);
          summary.set(item.id, {
            missing: coverage.unclassified().length,
            fresh: coverage.newUnclassified().length,
          });
        }
      }
      return summary;
    },
  );

  private static nodeLabel(node: ClassificationNodeDto): string {
    return node.code.trim() === '' ? node.name : `${node.code} ${node.name}`;
  }

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected labelOf(key: string): string {
    return this.catalog().labelOf(key);
  }

  protected pendingOf(id: string): Nullable<PendingSummary> {
    return this.pendingByClassification().get(id) ?? null;
  }

  protected wildcardsOf(node: ClassificationNodeDto): string[] {
    return ClassificationCoverage.wildcardPatterns(node);
  }

  protected exactCountOf(node: ClassificationNodeDto): number {
    return ClassificationCoverage.exactValues(node).length;
  }

  /** Nombre del nodo que hoy captura la cuenta, si no es el que se edita. */
  protected ownerOf(value: ClassifiableValue): Nullable<string> {
    const draft: Nullable<NodeDraft> = this.nodeDraft();
    const owner: Nullable<string> = this.coverage().nodeOf(value.value);
    if (owner === null || (draft !== null && draft.id === owner)) {
      return null;
    }
    const node: Nullable<ClassificationNodeDto> =
      this.nodes().find((n: ClassificationNodeDto): boolean => n.id === owner) ?? null;
    return node === null ? null : ClassificationsPage.nodeLabel(node);
  }

  protected changeField(key: Nullable<string>): void {
    this.fieldKey.set(key);
    this.ensureValues(key);
  }

  protected searchAccounts(event: AutoCompleteCompleteEvent): void {
    const draft: Nullable<NodeDraft> = this.nodeDraft();
    const chosen: Set<string> = new Set<string>(
      draft === null ? [] : draft.accounts.map((a: ClassifiableValue): string => a.value),
    );
    this.accountSuggestions.set(
      this.values()
        .search(event.query, 80)
        .filter((v: ClassifiableValue): boolean => !chosen.has(v.value))
        .slice(0, 50),
    );
  }

  protected addAccount(event: AutoCompleteSelectEvent): void {
    const value: unknown = event.value;
    const draft: Nullable<NodeDraft> = this.nodeDraft();
    if (value instanceof ClassifiableValue && draft !== null) {
      if (!draft.accounts.some((a: ClassifiableValue): boolean => a.value === value.value)) {
        draft.accounts = [...draft.accounts, value];
      }
    }
    this.accountQuery.set(null);
  }

  protected removeAccount(account: ClassifiableValue): void {
    const draft: Nullable<NodeDraft> = this.nodeDraft();
    if (draft !== null) {
      draft.accounts = draft.accounts.filter((a: ClassifiableValue): boolean => a !== account);
    }
  }

  protected showOnlyNew(): void {
    this.onlyNew.set(true);
    this.pendingQuery.set('');
  }

  /** Asigna las cuentas sin clasificar seleccionadas al nodo elegido (se aplica al guardar). */
  protected assignPending(): void {
    const nodeId: Nullable<string> = this.targetNodeId();
    const selected: ClassifiableValue[] = this.pendingSelection();
    if (nodeId === null || selected.length === 0) {
      this.notifier.info('Selecciona cuentas y el nodo al que se asignan');
      return;
    }
    this.nodes.set(
      ClassificationCoverage.assign(
        this.nodes(),
        nodeId,
        selected.map((v: ClassifiableValue): string => v.value),
      ),
    );
    this.pendingSelection.set([]);
    this.notifier.info(`${String(selected.length)} cuenta(s) asignada(s). Guarda para aplicar los cambios.`);
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
      this.ensureValues(found.fieldKey);
    }
    this.resetPending();
  }

  protected startNew(): void {
    this.selectedId.set(null);
    this.name.set('');
    this.fieldKey.set(null);
    this.nodes.set([]);
    this.editing.set(true);
    this.resetPending();
  }

  protected openNode(parent: Nullable<ClassificationNodeDto>, node: Nullable<ClassificationNodeDto>): void {
    this.nodeDraft.set(
      node === null
        ? {
            id: null,
            parentId: parent === null ? null : parent.id,
            code: '',
            name: '',
            patterns: [],
            accounts: [],
          }
        : {
            id: node.id,
            parentId: node.parentId,
            code: node.code,
            name: node.name,
            patterns: ClassificationCoverage.wildcardPatterns(node),
            accounts: ClassificationCoverage.exactValues(node).map((v: string): ClassifiableValue =>
              this.values().find(v),
            ),
          },
    );
    this.accountQuery.set(null);
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
    const placed: ClassificationNodeDto[] =
      draft.id === null
        ? [...this.nodes(), node]
        : this.nodes().map((n: ClassificationNodeDto): ClassificationNodeDto =>
            n.id === node.id ? node : n,
          );
    this.nodes.set(
      ClassificationCoverage.assign(
        placed,
        node.id,
        draft.accounts.map((a: ClassifiableValue): string => a.value),
      ),
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

  private resetPending(): void {
    this.pendingQuery.set('');
    this.onlyNew.set(false);
    this.pendingSelection.set([]);
    this.targetNodeId.set(null);
  }

  /** Carga una vez las cuentas reales del encabezado (se recargan al volver a la pantalla). */
  private ensureValues(fieldKey: Nullable<string>): void {
    if (
      fieldKey === null ||
      this.valuesByField().has(fieldKey) ||
      !this.context.can(ProjectPermission.DATA_VIEW)
    ) {
      return;
    }
    this.valuesLoading.set(true);
    this.api
      .classifiableValues(this.context.id(), fieldKey)
      .then((result: Result<ClassifiableValues>): void => {
        this.valuesLoading.set(false);
        result.match(
          (values: ClassifiableValues): void => {
            const next: Map<string, ClassifiableValues> = new Map<string, ClassifiableValues>(
              this.valuesByField(),
            );
            next.set(fieldKey, values);
            this.valuesByField.set(next);
          },
          (e: DomainError): void => this.notifier.error(e),
        );
      })
      .catch((): void => {
        this.valuesLoading.set(false);
      });
  }

  private async load(): Promise<void> {
    const [list, catalog] = await Promise.all([
      this.api.classificationList(this.context.id()),
      this.api.fieldCatalog(this.context.id()),
    ]);
    list.match(
      (items: ClassificationView[]): void => {
        this.list.set(items);
        for (const key of new Set<string>(items.map((i: ClassificationView): string => i.fieldKey))) {
          this.ensureValues(key);
        }
      },
      (e): void => this.notifier.error(e),
    );
    catalog.match(
      (c: CatalogView): void => this.catalog.set(c),
      (e): void => this.notifier.error(e),
    );
  }
}
