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
import { OrgLevel, ProjectPermission } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { ConfirmationService, TreeNode } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { AutoComplete } from 'primeng/autocomplete';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';
import { TreeTableModule } from 'primeng/treetable';
import { ProjectContext } from '../../projects/data/project-context';
import { OrgTree, OrgUnitView } from '../data/org.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { ReportsLabels } from '../data/reports-labels';

interface UnitDraft {
  readonly id: Nullable<string>;
  readonly level: OrgLevel;
  readonly parentId: Nullable<string>;
  readonly parentName: string;
}

/** Estructura organizacional: organización › país (monedas) › compañía › empresa › sucursal. */
@Component({
  selector: 'app-org-structure-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Button,
    Card,
    Dialog,
    AutoComplete,
    FloatLabel,
    InputText,
    Message,
    Tag,
    TreeTableModule,
  ],
  templateUrl: './org-structure.page.html',
  styleUrl: '../reports.scss',
})
export class OrgStructurePage implements OnInit {
  protected readonly tree: WritableSignal<OrgTree> = signal<OrgTree>(OrgTree.empty());
  protected readonly draft: WritableSignal<Nullable<UnitDraft>> = signal<Nullable<UnitDraft>>(null);
  protected readonly code: WritableSignal<string> = signal<string>('');
  protected readonly name: WritableSignal<string> = signal<string>('');
  protected readonly currencies: WritableSignal<string[]> = signal<string[]>([]);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly OrgLevel: typeof OrgLevel = OrgLevel;

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.DATA_CONFIGURE),
  );
  protected readonly nodes: Signal<TreeNode<OrgUnitView>[]> = computed((): TreeNode<OrgUnitView>[] =>
    this.children(this.tree(), null, OrgLevel.ORGANIZATION),
  );

  protected readonly dialogTitle: Signal<string> = computed((): string => {
    const draft: Nullable<UnitDraft> = this.draft();
    if (draft === null) {
      return '';
    }
    return `${draft.id === null ? 'Nueva unidad' : 'Editar'}: ${this.levelLabel(draft.level)}`;
  });

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected levelLabel(level: OrgLevel): string {
    return ReportsLabels.label(ReportsLabels.LEVELS, level);
  }

  protected childLevel(unit: OrgUnitView): Nullable<OrgLevel> {
    return ReportsLabels.childLevel(unit.s.level);
  }

  protected openNew(level: OrgLevel, parent: Nullable<OrgUnitView>): void {
    this.code.set('');
    this.name.set('');
    this.currencies.set([]);
    this.draft.set({
      id: null,
      level,
      parentId: parent === null ? null : parent.id,
      parentName: parent === null ? '' : parent.label(),
    });
  }

  protected openEdit(unit: OrgUnitView): void {
    this.code.set(unit.s.code);
    this.name.set(unit.s.name);
    this.currencies.set([...unit.s.currencies]);
    const parent: Nullable<OrgUnitView> = this.tree().find(unit.s.parentId);
    this.draft.set({
      id: unit.id,
      level: unit.s.level,
      parentId: unit.s.parentId,
      parentName: parent === null ? '' : parent.label(),
    });
  }

  protected async save(): Promise<void> {
    const draft: Nullable<UnitDraft> = this.draft();
    if (draft === null) {
      return;
    }
    this.saving.set(true);
    const body = { code: this.code(), name: this.name(), currencies: this.currencies() };
    const result: Result<OrgUnitView> =
      draft.id === null
        ? await this.api.addUnit(this.context.id(), { ...body, level: draft.level, parentId: draft.parentId })
        : await this.api.changeUnit(this.context.id(), draft.id, body);
    this.saving.set(false);
    const error = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.draft.set(null);
    this.notifier.success('Estructura actualizada');
    await this.load();
  }

  protected confirmRemove(unit: OrgUnitView): void {
    this.confirmation.confirm({
      header: 'Eliminar unidad',
      message: `¿Eliminar «${unit.label()}»?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.api
          .removeUnit(this.context.id(), unit.id)
          .then(async (result: Result<true>): Promise<void> => {
            const error = result.errorOrNull();
            if (error !== null) {
              this.notifier.error(error);
            }
            await this.load();
          })
          .catch((): void => {
            // Informado arriba.
          });
      },
    });
  }

  private children(tree: OrgTree, parentId: Nullable<string>, level: OrgLevel): TreeNode<OrgUnitView>[] {
    const next: Nullable<OrgLevel> = ReportsLabels.childLevel(level);
    return tree.children(parentId, level).map((unit: OrgUnitView): TreeNode<OrgUnitView> => ({
      key: unit.id,
      data: unit,
      expanded: true,
      children: next === null ? [] : this.children(tree, unit.id, next),
    }));
  }

  private async load(): Promise<void> {
    const result: Result<OrgTree> = await this.api.orgStructure(this.context.id());
    result.match(
      (tree: OrgTree): void => this.tree.set(tree),
      (error): void => this.notifier.error(error),
    );
  }
}
