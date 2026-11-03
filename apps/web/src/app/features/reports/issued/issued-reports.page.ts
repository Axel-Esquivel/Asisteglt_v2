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
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { OrgLevel } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { DatePicker } from 'primeng/datepicker';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { ProjectContext } from '../../projects/data/project-context';
import { ImportBatchView } from '../data/import.model';
import { OrgTree } from '../data/org.model';
import { ReportScope } from '../data/report-scope.model';
import { ReportsApiClient } from '../data/reports.api-client';
import { Option } from '../data/reports-labels';
import { TemplateView } from '../data/templates.model';

/**
 * Informes: el resultado final. Se elige una plantilla, el período y, si la plantilla lo permite, el
 * alcance (una compañía, varias o toda la organización); se abre la vista para imprimir o PDF.
 */
@Component({
  selector: 'app-issued-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Card, DatePicker, FloatLabel, Message, MultiSelect, Select],
  templateUrl: './issued-reports.page.html',
  styleUrl: '../reports.scss',
})
export class IssuedReportsPage implements OnInit {
  protected readonly templates: WritableSignal<TemplateView[]> = signal<TemplateView[]>([]);
  protected readonly templateId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly month: WritableSignal<Date> = signal<Date>(new Date());
  protected readonly org: WritableSignal<OrgTree> = signal<OrgTree>(OrgTree.empty());
  protected readonly scope: WritableSignal<ReportScope> = signal<ReportScope>(ReportScope.empty());
  protected readonly levels: typeof OrgLevel = OrgLevel;

  protected readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: ReportsApiClient = inject(ReportsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly router: Router = inject(Router);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);

  protected readonly templateOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.templates().map((t: TemplateView): Option<string> => ({ label: t.name, value: t.id })),
  );
  protected readonly selected: Signal<Nullable<TemplateView>> = computed(
    (): Nullable<TemplateView> =>
      this.templates().find((t: TemplateView): boolean => t.id === this.templateId()) ?? null,
  );

  public ngOnInit(): void {
    // Al volver de la vista de impresión se recuperan la plantilla, el período y el alcance.
    const params: ParamMap = this.route.snapshot.queryParamMap;
    this.templateId.set(params.get('template'));
    const requested: Nullable<Date> = ImportBatchView.monthOf(params.get('period') ?? '');
    if (requested !== null) {
      this.month.set(requested);
    }
    const scope: Nullable<ReportScope> = ReportScope.fromQuery(params);
    if (scope !== null) {
      this.scope.set(scope);
    }
    this.load(requested !== null).catch((): void => {
      // Informado en load.
    });
  }

  protected options(level: OrgLevel): Option<string>[] {
    return this.scope().options(this.org(), level);
  }

  protected currencyOptions(): Option<string>[] {
    return this.scope().currencyOptions(this.org());
  }

  /** Copia el alcance para que las listas dependientes se recalculen. */
  protected touch(): void {
    const s: ReportScope = this.scope();
    this.scope.set(
      new ReportScope(
        [...s.organizationIds],
        [...s.countryIds],
        [...s.currencies],
        [...s.companyIds],
        [...s.enterpriseIds],
        [...s.branchIds],
      ),
    );
  }

  protected async generate(): Promise<void> {
    const template: Nullable<TemplateView> = this.selected();
    if (template === null) {
      return;
    }
    const date: Date = this.month();
    const period: string = `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    await this.router.navigate(['/print/projects', this.context.id(), 'templates', template.id], {
      queryParams: {
        period,
        from: 'informes',
        ...(template.scopeParameter ? this.scope().toQuery() : {}),
      },
    });
  }

  /** Sin período elegido se propone el último mes con datos publicados. */
  private async load(hasPeriod: boolean): Promise<void> {
    const projectId: string = this.context.id();
    const [templates, org, history] = await Promise.all([
      this.api.templates(projectId),
      this.api.orgStructure(projectId),
      this.api.importHistory(projectId),
    ]);
    history.match(
      (batches: ImportBatchView[]): void => {
        const latest: Nullable<Date> = ImportBatchView.monthOf(
          ImportBatchView.latestPublishedPeriod(batches) ?? '',
        );
        if (!hasPeriod && latest !== null) {
          this.month.set(latest);
        }
      },
      (): void => {
        // Sin permiso de ver las cargas: se usa el mes actual.
      },
    );
    templates.match(
      (items: TemplateView[]): void => {
        this.templates.set(items);
        const first: Nullable<TemplateView> = items[0] ?? null;
        const known: boolean = items.some((t: TemplateView): boolean => t.id === this.templateId());
        if (!known && first !== null) {
          this.templateId.set(first.id);
        }
      },
      (e): void => this.notifier.error(e),
    );
    org.match(
      (tree: OrgTree): void => this.org.set(tree),
      (): void => {
        // Sin permiso de ver la estructura: el alcance se deja en «todo».
      },
    );
  }
}
