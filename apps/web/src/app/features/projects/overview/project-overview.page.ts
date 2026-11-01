import { ChangeDetectionStrategy, Component, WritableSignal, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ProjectPermission } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';
import { ProjectContext } from '../data/project-context';
import { ProjectFormErrors } from '../data/project-form-errors';
import { ProjectSummary } from '../data/project.model';
import { ProjectsApiClient } from '../data/projects.api-client';

interface ProjectControls {
  readonly name: FormControl<string>;
  readonly description: FormControl<string>;
}

/** Resumen del proyecto y edición de sus datos generales. */
@Component({
  selector: 'app-project-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, Button, Card, FloatLabel, InputText, Message, Textarea],
  templateUrl: './project-overview.page.html',
  styleUrl: './project-overview.page.scss',
})
export class ProjectOverviewPage {
  protected readonly context: ProjectContext = inject(ProjectContext);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly canManage: WritableSignal<boolean> = signal<boolean>(false);

  private readonly api: ProjectsApiClient = inject(ProjectsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);

  protected readonly form: FormGroup<ProjectControls> = this.fb.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(ProjectFormErrors.NAME_MIN),
        Validators.maxLength(ProjectFormErrors.NAME_MAX),
      ],
    ],
    description: ['', [Validators.maxLength(ProjectFormErrors.DESCRIPTION_MAX)]],
  });

  public constructor() {
    effect((): void => {
      const project: Nullable<ProjectSummary> = this.context.project();
      if (project !== null) {
        this.form.setValue({ name: project.name, description: project.description });
        this.canManage.set(project.can(ProjectPermission.PROJECT_MANAGE));
      }
    });
  }

  protected nameError(): Nullable<string> {
    return ProjectFormErrors.nameError(this.form.controls.name);
  }

  protected descriptionError(): Nullable<string> {
    return ProjectFormErrors.descriptionError(this.form.controls.description);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const result: Result<ProjectSummary> = await this.api.update(this.context.id(), this.form.getRawValue());
    this.saving.set(false);
    result.match(
      (project: ProjectSummary): void => {
        this.context.replace(project);
        this.notifier.success('Proyecto actualizado');
      },
      (error): void => this.notifier.error(error),
    );
  }
}
