import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CatalogFieldResponse,
  FieldCatalogResponse,
  OrgStructureResponse,
  OrgUnitResponse,
} from '@asisteglt/shared-contracts';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { CatalogService, TemplateOutcome } from '../application/catalog.service';
import { OrgStructureService } from '../application/org-structure.service';
import { FieldDefinition } from '../domain/field-catalog';
import {
  ApplyTemplateRequestDto,
  CatalogFieldRequestDto,
  CreateOrgUnitRequestDto,
  RenameFieldRequestDto,
  UpdateOrgUnitRequestDto,
} from './dto/reports.dto';
import { ReportsPresenter } from './reports.presenter';

/** Estructura organizacional y catálogo de encabezados de un proyecto. */
@Controller('projects/:projectId')
export class ReportsConfigController {
  public constructor(
    private readonly org: OrgStructureService,
    private readonly catalogs: CatalogService,
  ) {}

  @Get('org-structure')
  public async structure(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<OrgStructureResponse> {
    return ReportsPresenter.org((await this.org.get(projectId, p.userId)).unwrap());
  }

  @Post('org-structure/units')
  public async addUnit(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: CreateOrgUnitRequestDto,
  ): Promise<OrgUnitResponse> {
    return ReportsPresenter.orgUnit((await this.org.add(projectId, p.userId, body)).unwrap());
  }

  @Put('org-structure/units/:unitId')
  public async changeUnit(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('unitId') unitId: string,
    @Body() body: UpdateOrgUnitRequestDto,
  ): Promise<OrgUnitResponse> {
    return ReportsPresenter.orgUnit((await this.org.change(projectId, p.userId, unitId, body)).unwrap());
  }

  @Delete('org-structure/units/:unitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async removeUnit(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('unitId') unitId: string,
  ): Promise<void> {
    (await this.org.remove(projectId, p.userId, unitId)).unwrap();
  }

  @Get('catalog')
  public async catalog(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<FieldCatalogResponse> {
    return ReportsPresenter.catalog((await this.catalogs.get(projectId, p.userId)).unwrap());
  }

  @Post('catalog/fields')
  public async addField(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: CatalogFieldRequestDto,
  ): Promise<CatalogFieldResponse> {
    return ReportsPresenter.field(
      (await this.catalogs.add(projectId, p.userId, ReportsConfigController.definition(body))).unwrap(),
    );
  }

  @Put('catalog/fields/:key')
  public async redefine(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('key') key: string,
    @Body() body: CatalogFieldRequestDto,
  ): Promise<CatalogFieldResponse> {
    return ReportsPresenter.field(
      (
        await this.catalogs.redefine(projectId, p.userId, key, ReportsConfigController.definition(body))
      ).unwrap(),
    );
  }

  @Patch('catalog/fields/:key/label')
  public async rename(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('key') key: string,
    @Body() body: RenameFieldRequestDto,
  ): Promise<CatalogFieldResponse> {
    return ReportsPresenter.field(
      (await this.catalogs.rename(projectId, p.userId, key, body.label)).unwrap(),
    );
  }

  @Post('catalog/fields/:key/deactivate')
  public async deactivate(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('key') key: string,
    @Query('force') force: string,
  ): Promise<CatalogFieldResponse> {
    return ReportsPresenter.field(
      (await this.catalogs.deactivate(projectId, p.userId, key, force === 'true')).unwrap(),
    );
  }

  @Post('catalog/templates')
  public async template(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: ApplyTemplateRequestDto,
  ): Promise<FieldCatalogResponse> {
    const outcome: TemplateOutcome = (
      await this.catalogs.applyTemplate(projectId, p.userId, body.template)
    ).unwrap();
    return ReportsPresenter.catalog(outcome.catalog);
  }

  private static definition(body: CatalogFieldRequestDto): FieldDefinition {
    return {
      label: body.label,
      origin: body.origin,
      role: body.role,
      dataType: body.dataType,
      nature: body.nature ?? null,
      aggregation: body.aggregation ?? null,
      describes: body.describes ?? null,
      weightField: body.weightField ?? null,
    };
  }
}
