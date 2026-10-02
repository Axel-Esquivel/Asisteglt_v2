import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { RenderedTemplateResponse, TemplateResponse } from '@asisteglt/shared-contracts';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { TemplatesParsers } from '../application/templates-parsers';
import { TemplatesService } from '../application/templates.service';
import { ReportTemplate } from '../domain/report-template';

/** Plantillas de informe multipágina y su cálculo por período. */
@Controller('projects/:projectId/templates')
export class TemplatesController {
  public constructor(private readonly templates: TemplatesService) {}

  @Get()
  public async list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<TemplateResponse[]> {
    return Promise.all(
      (await this.templates.list(projectId, p.userId))
        .unwrap()
        .map((t: ReportTemplate): Promise<TemplateResponse> => this.templates.present(t)),
    );
  }

  @Get(':id')
  public async get(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<TemplateResponse> {
    return this.templates.present((await this.templates.get(projectId, p.userId, id)).unwrap());
  }

  @Get(':id/render')
  public async render(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Query('period') period: string,
  ): Promise<RenderedTemplateResponse> {
    return (await this.templates.render(projectId, p.userId, id, period)).unwrap();
  }

  @Post()
  public async create(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<TemplateResponse> {
    const request = TemplatesParsers.request(body).unwrap();
    return this.templates.present((await this.templates.save(projectId, p.userId, null, request)).unwrap());
  }

  @Put(':id')
  public async update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<TemplateResponse> {
    const request = TemplatesParsers.request(body).unwrap();
    return this.templates.present((await this.templates.save(projectId, p.userId, id, request)).unwrap());
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<void> {
    (await this.templates.delete(projectId, p.userId, id)).unwrap();
  }
}
