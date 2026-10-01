import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import {
  ClassificationResponse,
  ComputedReportResponse,
  ReportDefinitionResponse,
} from '@asisteglt/shared-contracts';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { AnalysisParsers } from '../application/analysis-parsers';
import { AnalysisService } from '../application/analysis.service';
import { Classification } from '../domain/classification';
import { ReportDefinition } from '../domain/report-definition';

/** Clasificaciones e informes matriciales de un proyecto. */
@Controller('projects/:projectId')
export class AnalysisController {
  public constructor(private readonly analysis: AnalysisService) {}

  @Get('classifications')
  public async classifications(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<ClassificationResponse[]> {
    return (await this.analysis.listClassifications(projectId, p.userId))
      .unwrap()
      .map(AnalysisController.classification);
  }

  @Post('classifications')
  public async createClassification(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<ClassificationResponse> {
    const request = AnalysisParsers.classification(body).unwrap();
    return AnalysisController.classification(
      (await this.analysis.saveClassification(projectId, p.userId, null, request)).unwrap(),
    );
  }

  @Put('classifications/:id')
  public async updateClassification(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ClassificationResponse> {
    const request = AnalysisParsers.classification(body).unwrap();
    return AnalysisController.classification(
      (await this.analysis.saveClassification(projectId, p.userId, id, request)).unwrap(),
    );
  }

  @Delete('classifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteClassification(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<void> {
    (await this.analysis.deleteClassification(projectId, p.userId, id)).unwrap();
  }

  @Get('report-definitions')
  public async reports(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<ReportDefinitionResponse[]> {
    return Promise.all(
      (await this.analysis.listReports(projectId, p.userId))
        .unwrap()
        .map((d: ReportDefinition): Promise<ReportDefinitionResponse> => this.analysis.present(d)),
    );
  }

  @Post('report-definitions')
  public async createReport(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<ReportDefinitionResponse> {
    const request = AnalysisParsers.report(body).unwrap();
    return this.analysis.present(
      (await this.analysis.saveReport(projectId, p.userId, null, request)).unwrap(),
    );
  }

  @Put('report-definitions/:id')
  public async updateReport(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ReportDefinitionResponse> {
    const request = AnalysisParsers.report(body).unwrap();
    return this.analysis.present((await this.analysis.saveReport(projectId, p.userId, id, request)).unwrap());
  }

  @Delete('report-definitions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteReport(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<void> {
    (await this.analysis.deleteReport(projectId, p.userId, id)).unwrap();
  }

  @Get('report-definitions/:id/run')
  public async run(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Query('period') period: string,
  ): Promise<ComputedReportResponse> {
    return (
      await this.analysis.run(projectId, p.userId, id, typeof period === 'string' ? period : '')
    ).unwrap();
  }

  private static classification(c: Classification): ClassificationResponse {
    const s = c.toSnapshot();
    return {
      id: s.id,
      name: s.name,
      fieldKey: s.fieldKey,
      nodes: s.nodes,
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
