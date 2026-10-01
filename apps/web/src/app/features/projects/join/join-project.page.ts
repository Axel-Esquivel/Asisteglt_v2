import {
  ChangeDetectionStrategy,
  Component,
  InputSignal,
  OnInit,
  WritableSignal,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ProjectSummary } from '../data/project.model';
import { ProjectsApiClient } from '../data/projects.api-client';

/** Canjea un vínculo de invitación (`/app/join/:token`) y abre el proyecto. */
@Component({
  selector: 'app-join-project-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, Message, ProgressSpinner],
  templateUrl: './join-project.page.html',
})
export class JoinProjectPage implements OnInit {
  public readonly token: InputSignal<string> = input.required<string>();

  protected readonly errorMessage: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);

  private readonly api: ProjectsApiClient = inject(ProjectsApiClient);
  private readonly router: Router = inject(Router);
  private readonly notifier: Notifier = inject(Notifier);

  public ngOnInit(): void {
    this.redeem().catch((): void => {
      // Informado en redeem.
    });
  }

  private async redeem(): Promise<void> {
    const result: Result<ProjectSummary> = await this.api.join(this.token());
    await result.match(
      async (project: ProjectSummary): Promise<void> => {
        this.notifier.success(`Te uniste a «${project.name}» como ${project.roleLabel()}`);
        await this.router.navigate(['/app/projects', project.id], { replaceUrl: true });
      },
      (error): Promise<void> => {
        this.errorMessage.set(error.message);
        return Promise.resolve();
      },
    );
  }
}
