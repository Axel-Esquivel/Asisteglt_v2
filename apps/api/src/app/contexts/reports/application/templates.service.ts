import { Injectable } from '@nestjs/common';
import {
  ComputedReportResponse,
  ProjectPermission,
  RenderedElementDto,
  RenderedPageDto,
  RenderedTemplateResponse,
  ReportDefinitionRequest,
  TemplateElementDto,
  TemplateErrorCode,
  TemplatePageDto,
  TemplateRequest,
  TemplateResponse,
} from '@asisteglt/shared-contracts';
import { FormulaFormatter, ListFieldResolver } from '@asisteglt/shared-formula-engine';
import { Clock, EntityId, NotFoundError, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { ProjectAccess } from '../../projects/application/project-access';
import { Project } from '../../projects/domain/project';
import { CatalogResolver } from '../domain/catalog-resolver';
import { ReportDefinitionRepository, ReportTemplateRepository } from '../domain/ports';
import { ReportDefinition } from '../domain/report-definition';
import { ReportElement, ReportTemplate, TemplateContext } from '../domain/report-template';
import { AnalysisService } from './analysis.service';
import { CatalogService } from './catalog.service';
import { ElementRenderer, TemplateText } from './template-renderer';

/** Plantillas de informe: diseño (REPORTS_DESIGN) y cálculo por período (REPORTS_VIEW). */
@Injectable()
export class TemplatesService {
  public constructor(
    private readonly templates: ReportTemplateRepository,
    private readonly definitions: ReportDefinitionRepository,
    private readonly catalogs: CatalogService,
    private readonly analysis: AnalysisService,
    private readonly access: ProjectAccess,
    private readonly clock: Clock,
  ) {}

  public async list(projectId: string, userId: EntityId): Promise<Result<ReportTemplate[]>> {
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_VIEW)).flatMapAsync(
      async (p: Project): Promise<Result<ReportTemplate[]>> =>
        Result.ok(await this.templates.findByProject(p.getId())),
    );
  }

  public async get(projectId: string, userId: EntityId, templateId: string): Promise<Result<ReportTemplate>> {
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_VIEW)).flatMapAsync(
      (p: Project): Promise<Result<ReportTemplate>> => this.find(p, templateId),
    );
  }

  public async save(
    projectId: string,
    userId: EntityId,
    templateId: Nullable<string>,
    request: TemplateRequest,
  ): Promise<Result<ReportTemplate>> {
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_DESIGN)).flatMapAsync(
      async (p: Project): Promise<Result<ReportTemplate>> => {
        const context: TemplateContext = await this.context(p);
        const result: Result<ReportTemplate> =
          templateId === null
            ? ReportTemplate.create(p.getId(), request, context, this.clock)
            : (await this.find(p, templateId)).flatMap((t: ReportTemplate): Result<ReportTemplate> =>
                t.update(request, context, this.clock),
              );
        if (result.isOk()) {
          await this.templates.save(result.unwrap());
        }
        return result;
      },
    );
  }

  public async delete(projectId: string, userId: EntityId, templateId: string): Promise<Result<true>> {
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_DESIGN)).flatMapAsync(
      async (p: Project): Promise<Result<true>> =>
        (await this.find(p, templateId)).flatMapAsync(async (t: ReportTemplate): Promise<Result<true>> => {
          await this.templates.delete(t.getId());
          return Result.ok(true);
        }),
    );
  }

  public async render(
    projectId: string,
    userId: EntityId,
    templateId: string,
    period: string,
  ): Promise<Result<RenderedTemplateResponse>> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return Result.fail(
        new ValidationError(TemplateErrorCode.INVALID_TEMPLATE, 'El período debe tener el formato AAAA-MM'),
      );
    }
    return (await this.access.require(projectId, userId, ProjectPermission.REPORTS_VIEW)).flatMapAsync(
      async (p: Project): Promise<Result<RenderedTemplateResponse>> =>
        (await this.find(p, templateId)).flatMapAsync(
          async (template: ReportTemplate): Promise<Result<RenderedTemplateResponse>> => {
            const spec: TemplateRequest = template.getSpec();
            const reports: Map<string, Promise<Result<ComputedReportResponse>>> = new Map<
              string,
              Promise<Result<ComputedReportResponse>>
            >();
            const today: Date = this.clock.now();
            const pages: RenderedPageDto[] = [];
            for (const [index, page] of spec.pages.entries()) {
              const text: TemplateText = new TemplateText(
                period,
                p.getName(),
                today,
                index + 1,
                spec.pages.length,
              );
              const renderer: ElementRenderer = new ElementRenderer(this.analysis, p, period, text, reports);
              const elements: RenderedElementDto[] = await Promise.all(
                page.elements.map((e: TemplateElementDto): Promise<RenderedElementDto> =>
                  ReportElement.from(e).accept(renderer),
                ),
              );
              pages.push({
                id: page.id,
                header: text.resolve(page.header),
                footer: text.resolve(page.footer),
                elements,
              });
            }
            return Result.ok({ templateId: template.getId().toString(), name: spec.name, period, pages });
          },
        ),
    );
  }

  private async context(p: Project): Promise<TemplateContext> {
    const columns: Map<string, number> = new Map<string, number>(
      (await this.definitions.findByProject(p.getId())).map((d: ReportDefinition): [string, number] => {
        const spec: ReportDefinitionRequest = d.getSpec();
        return [d.getId().toString(), spec.measures.length + spec.formulaColumns.length];
      }),
    );
    return new TemplateContext(CatalogResolver.of(await this.catalogs.of(p.getId())), columns);
  }

  private async find(project: Project, id: string): Promise<Result<ReportTemplate>> {
    const parsed: Result<EntityId> = EntityId.fromString(id);
    const found: Nullable<ReportTemplate> = parsed.isOk()
      ? (await this.templates.findById(parsed.unwrap()))
          .filter((t: ReportTemplate): boolean => t.belongsTo(project.getId()))
          .toNullable()
      : null;
    return found === null
      ? Result.fail(new NotFoundError(TemplateErrorCode.TEMPLATE_NOT_FOUND, 'La plantilla no existe'))
      : Result.ok(found);
  }

  /** Respuesta con las fórmulas de los indicadores escritas con los nombres vigentes. */
  public async present(template: ReportTemplate): Promise<TemplateResponse> {
    const snapshot = template.toSnapshot();
    const resolver: ListFieldResolver = CatalogResolver.of(
      await this.catalogs.of(EntityId.fromString(snapshot.projectId).unwrap()),
    );
    const formatter: FormulaFormatter = new FormulaFormatter();
    return {
      id: snapshot.id,
      name: snapshot.name,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt.toISOString(),
      pages: snapshot.pages.map((page: TemplatePageDto): TemplatePageDto => ({
        ...page,
        elements: page.elements.map((e: TemplateElementDto): TemplateElementDto =>
          e.formula === null ? e : { ...e, formula: formatter.format(e.formula, resolver) },
        ),
      })),
    };
  }
}
