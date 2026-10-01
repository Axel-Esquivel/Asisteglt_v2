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
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ModuleType, ProjectRole } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProjectContext } from '../data/project-context';
import { ProjectLabels, RoleOption } from '../data/project-labels';
import { CreatedShareLink, ProjectSummary, ShareLinkView } from '../data/project.model';
import { ProjectsApiClient } from '../data/projects.api-client';

interface ShareLinkControls {
  readonly role: FormControl<ProjectRole>;
  readonly expiresInDays: FormControl<Nullable<number>>;
  readonly maxUses: FormControl<Nullable<number>>;
}

/** Vínculos para unirse al proyecto con un rol, caducidad y límite de usos. */
@Component({
  selector: 'app-project-sharing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    Button,
    Card,
    FloatLabel,
    InputNumber,
    InputText,
    Message,
    Select,
    TableModule,
    Tag,
  ],
  templateUrl: './project-sharing.page.html',
  styleUrl: './project-sharing.page.scss',
})
export class ProjectSharingPage implements OnInit {
  protected readonly links: WritableSignal<ShareLinkView[]> = signal<ShareLinkView[]>([]);
  protected readonly createdUrl: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ProjectsApiClient = inject(ProjectsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);

  protected readonly roleOptions: Signal<RoleOption[]> = computed((): RoleOption[] => {
    const project: Nullable<ProjectSummary> = this.context.project();
    return ProjectLabels.assignableRoles(project === null ? ModuleType.REPORTS : project.moduleType);
  });

  protected readonly form: FormGroup<ShareLinkControls> = new FormGroup<ShareLinkControls>({
    role: this.fb.control<ProjectRole>(this.defaultRole(), [Validators.required]),
    expiresInDays: new FormControl<Nullable<number>>(7, [Validators.min(1), Validators.max(365)]),
    maxUses: new FormControl<Nullable<number>>(null, [Validators.min(1), Validators.max(10_000)]),
  });

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected async create(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    const result: Result<CreatedShareLink> = await this.api.createShareLink(this.context.id(), {
      role: value.role,
      expiresInDays: value.expiresInDays,
      maxUses: value.maxUses,
    });
    this.saving.set(false);
    result.match(
      (created: CreatedShareLink): void => {
        this.createdUrl.set(`${window.location.origin}/app/join/${encodeURIComponent(created.token)}`);
        this.notifier.success('Vínculo creado; cópialo ahora, no se volverá a mostrar');
      },
      (error): void => this.notifier.error(error),
    );
    await this.load();
  }

  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.notifier.success('Vínculo copiado al portapapeles');
    } catch {
      this.notifier.info('Selecciona el vínculo y cópialo manualmente');
    }
  }

  protected async revoke(link: ShareLinkView): Promise<void> {
    const result: Result<true> = await this.api.revokeShareLink(this.context.id(), link.id);
    result.match(
      (): void => this.notifier.success('Vínculo revocado'),
      (error): void => this.notifier.error(error),
    );
    await this.load();
  }

  private defaultRole(): ProjectRole {
    const project: Nullable<ProjectSummary> = this.context.project();
    return ProjectLabels.defaultInviteRole(project === null ? ModuleType.REPORTS : project.moduleType);
  }

  private async load(): Promise<void> {
    const result: Result<ShareLinkView[]> = await this.api.shareLinks(this.context.id());
    result.match(
      (items: ShareLinkView[]): void => this.links.set(items),
      (error): void => this.notifier.error(error),
    );
  }
}
