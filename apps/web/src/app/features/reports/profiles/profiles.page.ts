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
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BalanceCheckDto, ProjectPermission } from '@asisteglt/shared-contracts';
import { FormulaContext, FormulaFormatter, ListFieldResolver } from '@asisteglt/shared-formula-engine';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProjectContext } from '../../projects/data/project-context';
import { CatalogView } from '../data/catalog.model';
import { FormulaCheck } from '../data/operations.model';
import { ProfileView } from '../data/profile.model';
import { ReportsApiClient } from '../data/reports.api-client';

/** Validación de cuadre editable (fórmulas con nombres). */
class CheckDraft {
  public constructor(
    public label: string,
    public left: string,
    public right: string,
    public tolerance: string,
    public blocking: boolean,
  ) {}

  public toDto(): BalanceCheckDto {
    return {
      label: this.label,
      left: this.left,
      right: this.right,
      tolerance: this.tolerance,
      blocking: this.blocking,
    };
  }
}

/** Preconfiguraciones con nombre del proyecto (docs/12 §3). */
@Component({
  selector: 'app-profiles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    Button,
    Card,
    Dialog,
    FloatLabel,
    InputText,
    Message,
    TableModule,
    Tag,
    ToggleSwitch,
  ],
  templateUrl: './profiles.page.html',
  styleUrl: '../reports.scss',
})
export class ProfilesPage implements OnInit {
  protected readonly profiles: WritableSignal<ProfileView[]> = signal<ProfileView[]>([]);
  protected readonly duplicating: WritableSignal<Nullable<ProfileView>> = signal<Nullable<ProfileView>>(null);
  protected readonly duplicateName: WritableSignal<string> = signal<string>('');

  protected readonly checking: WritableSignal<Nullable<ProfileView>> = signal<Nullable<ProfileView>>(null);
  protected readonly checks: WritableSignal<CheckDraft[]> = signal<CheckDraft[]>([]);
  protected readonly savingChecks: WritableSignal<boolean> = signal<boolean>(false);
  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  protected readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.DATA_CONFIGURE),
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected async act(profile: ProfileView, action: 'activate' | 'archive'): Promise<void> {
    await this.handle(
      await this.api.profileAction(this.context.id(), profile.id, action),
      action === 'activate' ? 'Activada' : 'Archivada',
    );
  }

  protected openDuplicate(profile: ProfileView): void {
    this.duplicateName.set(`${profile.name}_copia`);
    this.duplicating.set(profile);
  }

  protected async duplicate(): Promise<void> {
    const source: Nullable<ProfileView> = this.duplicating();
    if (source !== null) {
      const ok: boolean = await this.handle(
        await this.api.duplicateProfile(this.context.id(), source.id, this.duplicateName()),
        'Duplicada',
      );
      if (ok) {
        this.duplicating.set(null);
      }
    }
  }

  protected openChecks(profile: ProfileView): void {
    const resolver: ListFieldResolver = FormulaCheck.resolver(this.catalog());
    const formatter: FormulaFormatter = new FormulaFormatter();
    this.checks.set(
      profile.s.checks.map(
        (c: BalanceCheckDto): CheckDraft =>
          new CheckDraft(
            c.label,
            formatter.format(c.left, resolver),
            formatter.format(c.right, resolver),
            c.tolerance,
            c.blocking,
          ),
      ),
    );
    this.checking.set(profile);
  }

  protected addCheck(): void {
    this.checks.update((checks: CheckDraft[]): CheckDraft[] => [
      ...checks,
      new CheckDraft('', '=SUMA()', '=SUMA()', '0.01', true),
    ]);
  }

  protected removeCheck(index: number): void {
    this.checks.update((checks: CheckDraft[]): CheckDraft[] =>
      checks.filter((_c: CheckDraft, i: number): boolean => i !== index),
    );
  }

  protected formulaCheck(source: string): FormulaCheck {
    return FormulaCheck.of(source, this.catalog(), FormulaContext.AGGREGATE);
  }

  protected async saveChecks(): Promise<void> {
    const profile: Nullable<ProfileView> = this.checking();
    if (profile === null) {
      return;
    }
    this.savingChecks.set(true);
    const result: Result<ProfileView> = await this.api.saveChecks(this.context.id(), profile.id, {
      checks: this.checks().map((c: CheckDraft): BalanceCheckDto => c.toDto()),
    });
    this.savingChecks.set(false);
    if (await this.handle(result, 'Validaciones guardadas')) {
      this.checking.set(null);
    }
  }

  private async handle(result: Result<ProfileView>, message: string): Promise<boolean> {
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return false;
    }
    this.notifier.success(message);
    await this.load();
    return true;
  }

  private async load(): Promise<void> {
    (await this.api.fieldCatalog(this.context.id())).match(
      (c: CatalogView): void => this.catalog.set(c),
      (error): void => this.notifier.error(error),
    );
    const result: Result<ProfileView[]> = await this.api.profileList(this.context.id());
    result.match(
      (items: ProfileView[]): void => this.profiles.set(items),
      (error): void => this.notifier.error(error),
    );
  }
}
