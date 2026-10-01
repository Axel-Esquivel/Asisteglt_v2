import { Injectable, Signal, inject } from '@angular/core';
import { ProjectPermission } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { BaseStore, LoadStatus } from '@asisteglt/web-core';
import { ProjectSummary } from './project.model';
import { ProjectsApiClient } from './projects.api-client';

interface ProjectContextState {
  readonly status: LoadStatus;
  readonly project: Nullable<ProjectSummary>;
  readonly errorMessage: Nullable<string>;
}

/**
 * Proyecto abierto. Lo provee el layout del proyecto, de modo que todas las páginas hijas
 * (resumen, miembros, datos, informes, inventario) comparten el mismo estado.
 */
@Injectable()
export class ProjectContext extends BaseStore<ProjectContextState> {
  public readonly status: Signal<LoadStatus> = this.select((s: ProjectContextState): LoadStatus => s.status);
  public readonly project: Signal<Nullable<ProjectSummary>> = this.select(
    (s: ProjectContextState): Nullable<ProjectSummary> => s.project,
  );
  public readonly errorMessage: Signal<Nullable<string>> = this.select(
    (s: ProjectContextState): Nullable<string> => s.errorMessage,
  );

  private readonly api: ProjectsApiClient = inject(ProjectsApiClient);
  private projectId: string = '';

  public constructor() {
    super({ status: LoadStatus.IDLE, project: null, errorMessage: null });
  }

  public id(): string {
    return this.projectId;
  }

  public can(permission: ProjectPermission): boolean {
    const project: Nullable<ProjectSummary> = this.project();
    return project !== null && project.can(permission);
  }

  public async open(projectId: string): Promise<void> {
    this.projectId = projectId;
    this.update((): ProjectContextState => ({ status: LoadStatus.LOADING, project: null, errorMessage: null }));
    await this.reload();
  }

  public async reload(): Promise<void> {
    const result: Result<ProjectSummary> = await this.api.find(this.projectId);
    this.update(
      (current: ProjectContextState): ProjectContextState =>
        result.match(
          (project: ProjectSummary): ProjectContextState => ({ status: LoadStatus.LOADED, project, errorMessage: null }),
          (error): ProjectContextState => ({ ...current, status: LoadStatus.FAILED, errorMessage: error.message }),
        ),
    );
  }

  public replace(project: ProjectSummary): void {
    this.update((): ProjectContextState => ({ status: LoadStatus.LOADED, project, errorMessage: null }));
  }
}
