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
import { ProjectPermission } from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProjectContext } from '../../projects/data/project-context';
import { ProfileView } from '../data/profile.model';
import { ReportsApiClient } from '../data/reports.api-client';

/** Preconfiguraciones con nombre del proyecto (docs/12 §3). */
@Component({
  selector: 'app-profiles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, RouterLink, Button, Card, Dialog, FloatLabel, InputText, TableModule, Tag],
  templateUrl: './profiles.page.html',
  styleUrl: '../reports.scss',
})
export class ProfilesPage implements OnInit {
  protected readonly profiles: WritableSignal<ProfileView[]> = signal<ProfileView[]>([]);
  protected readonly duplicating: WritableSignal<Nullable<ProfileView>> = signal<Nullable<ProfileView>>(null);
  protected readonly duplicateName: WritableSignal<string> = signal<string>('');

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
    const result: Result<ProfileView[]> = await this.api.profileList(this.context.id());
    result.match(
      (items: ProfileView[]): void => this.profiles.set(items),
      (error): void => this.notifier.error(error),
    );
  }
}
