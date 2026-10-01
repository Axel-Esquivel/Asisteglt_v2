import { ChangeDetectionStrategy, Component, OnInit, WritableSignal, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ModuleType } from '@asisteglt/shared-contracts';
import { Result } from '@asisteglt/shared-kernel';
import { LoadStatus, Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { SelectButton } from 'primeng/selectbutton';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { ModuleOption, ProjectLabels } from '../data/project-labels';
import { ProjectSummary } from '../data/project.model';
import { ProjectsApiClient } from '../data/projects.api-client';

interface CreateProjectControls {
  readonly name: FormControl<string>;
  readonly description: FormControl<string>;
  readonly moduleType: FormControl<ModuleType>;
}

/** Lista de proyectos del usuario y creación de proyectos nuevos. */
@Component({
  selector: 'app-projects-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Button,
    Card,
    Dialog,
    FloatLabel,
    InputText,
    Message,
    SelectButton,
    Skeleton,
    Tag,
    Textarea,
  ],
  templateUrl: './projects-list.page.html',
  styleUrl: './projects-list.page.scss',
})
export class ProjectsListPage implements OnInit {
  protected readonly LoadStatus: typeof LoadStatus = LoadStatus;
  protected readonly moduleOptions: ModuleOption[] = ProjectLabels.moduleOptions();
  protected readonly projects: WritableSignal<ProjectSummary[]> = signal<ProjectSummary[]>([]);
  protected readonly status: WritableSignal<LoadStatus> = signal<LoadStatus>(LoadStatus.IDLE);
  protected readonly dialogOpen: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);

  private readonly api: ProjectsApiClient = inject(ProjectsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly router: Router = inject(Router);
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);

  protected readonly form: FormGroup<CreateProjectControls> = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(1000)]],
    moduleType: [ModuleType.REPORTS, [Validators.required]],
  });

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected openDialog(): void {
    this.form.reset();
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected async create(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const result: Result<ProjectSummary> = await this.api.create(this.form.getRawValue());
    this.saving.set(false);
    await result.match(
      async (project: ProjectSummary): Promise<void> => {
        this.dialogOpen.set(false);
        this.notifier.success(`Proyecto «${project.name}» creado`);
        await this.router.navigate(['/app/projects', project.id]);
      },
      (error): Promise<void> => {
        this.notifier.error(error);
        return Promise.resolve();
      },
    );
  }

  protected async open(project: ProjectSummary): Promise<void> {
    await this.router.navigate(['/app/projects', project.id]);
  }

  private async load(): Promise<void> {
    this.status.set(LoadStatus.LOADING);
    const result: Result<ProjectSummary[]> = await this.api.list();
    result.match(
      (items: ProjectSummary[]): void => {
        this.projects.set(items);
        this.status.set(LoadStatus.LOADED);
      },
      (error): void => {
        this.status.set(LoadStatus.FAILED);
        this.notifier.error(error);
      },
    );
  }
}
