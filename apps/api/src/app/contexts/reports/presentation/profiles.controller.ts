import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { BalanceChecksRequest, ProfileRequest, ProfileResponse } from '@asisteglt/shared-contracts';
import { Result } from '@asisteglt/shared-kernel';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { ProfileService } from '../application/profile.service';
import { ReportsRequestParser } from '../application/request-parsers';
import { DataSourceProfile } from '../domain/data-source-profile';
import { DuplicateProfileRequestDto } from './dto/reports.dto';
import { ReportsPresenter } from './reports.presenter';

/** Preconfiguraciones con nombre (el cuerpo se valida con `ReportsRequestParser`). */
@Controller('projects/:projectId/profiles')
export class ProfilesController {
  public constructor(private readonly profiles: ProfileService) {}

  @Get()
  public async list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<ProfileResponse[]> {
    return (await this.profiles.list(projectId, p.userId)).unwrap().map(ReportsPresenter.profile);
  }

  @Get(':profileId')
  public async get(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('profileId') profileId: string,
  ): Promise<ProfileResponse> {
    return ReportsPresenter.profile((await this.profiles.get(projectId, p.userId, profileId)).unwrap());
  }

  @Post()
  public async create(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<ProfileResponse> {
    const request: ProfileRequest = ReportsRequestParser.profile(body).unwrap();
    return ReportsPresenter.profile((await this.profiles.create(projectId, p.userId, request)).unwrap());
  }

  @Put(':profileId')
  public async update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ): Promise<ProfileResponse> {
    const request: ProfileRequest = ReportsRequestParser.profile(body).unwrap();
    return ReportsPresenter.profile(
      (await this.profiles.update(projectId, p.userId, profileId, request)).unwrap(),
    );
  }

  @Put(':profileId/checks')
  public async checks(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ): Promise<ProfileResponse> {
    const request: BalanceChecksRequest = ReportsRequestParser.checks(body).unwrap();
    return ProfilesController.present(await this.profiles.setChecks(projectId, p.userId, profileId, request));
  }

  @Post(':profileId/activate')
  public async activate(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('profileId') profileId: string,
  ): Promise<ProfileResponse> {
    return ProfilesController.present(await this.profiles.activate(projectId, p.userId, profileId));
  }

  @Post(':profileId/archive')
  public async archive(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('profileId') profileId: string,
  ): Promise<ProfileResponse> {
    return ProfilesController.present(await this.profiles.archive(projectId, p.userId, profileId));
  }

  @Post(':profileId/duplicate')
  public async duplicate(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('profileId') profileId: string,
    @Body() body: DuplicateProfileRequestDto,
  ): Promise<ProfileResponse> {
    return ProfilesController.present(
      await this.profiles.duplicate(projectId, p.userId, profileId, body.name),
    );
  }

  private static present(result: Result<DataSourceProfile>): ProfileResponse {
    return ReportsPresenter.profile(result.unwrap());
  }
}
