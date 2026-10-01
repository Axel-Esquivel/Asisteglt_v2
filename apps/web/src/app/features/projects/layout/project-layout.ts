import { ChangeDetectionStrategy, Component, Signal, computed, effect, inject, input, InputSignal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Nullable } from '@asisteglt/shared-kernel';
import { LoadStatus } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { Tab, TabList, Tabs } from 'primeng/tabs';
import { Tag } from 'primeng/tag';
import { filter, map } from 'rxjs';
import { ProjectContext } from '../data/project-context';
import { ProjectSummary } from '../data/project.model';
import { ProjectSection, ProjectSections } from './project-sections';

/**
 * Contexto de proyecto: cabecera, pestañas y un `router-outlet` propio para sus secciones.
 * Provee `ProjectContext` a todas las páginas hijas.
 */
@Component({
  selector: 'app-project-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, Tabs, TabList, Tab, Tag, Button, Message, Skeleton],
  providers: [ProjectContext],
  templateUrl: './project-layout.html',
  styleUrl: './project-layout.scss',
})
export class ProjectLayout {
  public readonly projectId: InputSignal<string> = input.required<string>();

  protected readonly LoadStatus: typeof LoadStatus = LoadStatus;
  protected readonly context: ProjectContext = inject(ProjectContext);
  private readonly router: Router = inject(Router);

  private readonly url: Signal<string> = toSignal(
    this.router.events.pipe(
      filter((event: unknown): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd): string => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly sections: Signal<ProjectSection[]> = computed((): ProjectSection[] => {
    const project: Nullable<ProjectSummary> = this.context.project();
    return project === null ? [] : ProjectSections.for(project);
  });

  protected readonly activeSection: Signal<string> = computed((): string =>
    ProjectSections.active(this.url(), this.projectId()),
  );

  public constructor() {
    effect((): void => {
      const id: string = this.projectId();
      this.context.open(id).catch((): void => {
        // El error queda en el estado del contexto.
      });
    });
  }

  protected link(section: ProjectSection): string[] {
    return section.path === '' ? ['/app/projects', this.projectId()] : ['/app/projects', this.projectId(), section.path];
  }
}
