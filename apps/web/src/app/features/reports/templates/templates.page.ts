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
import { Router, RouterLink } from '@angular/router';
import { ProjectPermission } from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ProjectContext } from '../../projects/data/project-context';
import { ReportsApiClient } from '../data/reports.api-client';
import { TemplateView } from '../data/templates.model';
import { TemplateDesignerStore } from './template-designer.store';

/** Plantillas de informe del proyecto: crear, diseñar, ver e imprimir. */
@Component({
  selector: 'app-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Button, Card, Dialog, FloatLabel, InputText, TableModule],
  templateUrl: './templates.page.html',
  styleUrl: '../reports.scss',
})
export class TemplatesPage implements OnInit {
  protected readonly templates: WritableSignal<TemplateView[]> = signal<TemplateView[]>([]);
  protected readonly creating: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly newName: WritableSignal<string> = signal<string>('');

  protected readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly router: Router = inject(Router);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);

  protected readonly canDesign: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.REPORTS_DESIGN),
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected pagesLabel(template: TemplateView): string {
    return template.pages.length === 1 ? '1 página' : `${String(template.pages.length)} páginas`;
  }

  protected async create(): Promise<void> {
    const result: Result<TemplateView> = await this.api.saveTemplate(this.context.id(), null, {
      name: this.newName(),
      pages: [TemplateDesignerStore.blankPage(1)],
    });
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.creating.set(false);
    await this.router.navigate(['/app/projects', this.context.id(), 'templates', result.unwrap().id]);
  }

  protected confirmDelete(template: TemplateView): void {
    this.confirmation.confirm({
      header: 'Eliminar plantilla',
      message: `¿Eliminar «${template.name}»?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.api
          .deleteTemplate(this.context.id(), template.id)
          .then(async (result: Result<true>): Promise<void> => {
            const error: Nullable<DomainError> = result.errorOrNull();
            if (error !== null) {
              this.notifier.error(error);
              return;
            }
            await this.load();
          })
          .catch((): void => {
            // Informado arriba.
          });
      },
    });
  }

  private async load(): Promise<void> {
    (await this.api.templates(this.context.id())).match(
      (items: TemplateView[]): void => this.templates.set(items),
      (e): void => this.notifier.error(e),
    );
  }
}
