import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  CreatedShareLinkResponse,
  MemberResponse,
  ProjectResponse,
  ShareLinkResponse,
} from '@asisteglt/shared-contracts';
import { Clock } from '@asisteglt/shared-kernel';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { CreatedShareLink, MemberView, ProjectService, ShareLinkSpec } from '../application/project.service';
import { Project } from '../domain/project';
import { ShareLink } from '../domain/share-link';
import {
  AddMemberRequestDto,
  ChangeMemberRoleRequestDto,
  CreateProjectRequestDto,
  CreateShareLinkRequestDto,
  RedeemShareLinkRequestDto,
  UpdateProjectRequestDto,
} from './dto/projects.dto';
import { ProjectsPresenter } from './projects.presenter';

@Controller('projects')
export class ProjectsController {
  public constructor(
    private readonly service: ProjectService,
    private readonly clock: Clock,
  ) {}

  @Get()
  public async list(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<ProjectResponse[]> {
    return (await this.service.listFor(principal.userId)).map((p: Project): ProjectResponse =>
      ProjectsPresenter.project(p, principal.userId),
    );
  }

  @Post()
  public async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateProjectRequestDto,
  ): Promise<ProjectResponse> {
    const project: Project = (
      await this.service.create(principal.userId, body.name, body.description, body.moduleType)
    ).unwrap();
    return ProjectsPresenter.project(project, principal.userId);
  }

  @Post('join')
  public async join(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: RedeemShareLinkRequestDto,
  ): Promise<ProjectResponse> {
    const project: Project = (await this.service.redeem(body.token, principal.userId)).unwrap();
    return ProjectsPresenter.project(project, principal.userId);
  }

  @Get(':id')
  public async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ): Promise<ProjectResponse> {
    return ProjectsPresenter.project(
      (await this.service.get(id, principal.userId)).unwrap(),
      principal.userId,
    );
  }

  @Patch(':id')
  public async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() body: UpdateProjectRequestDto,
  ): Promise<ProjectResponse> {
    const project: Project = (
      await this.service.update(id, principal.userId, body.name, body.description)
    ).unwrap();
    return ProjectsPresenter.project(project, principal.userId);
  }

  @Get(':id/members')
  public async members(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ): Promise<MemberResponse[]> {
    return (await this.service.members(id, principal.userId))
      .unwrap()
      .map((view: MemberView): MemberResponse => ProjectsPresenter.member(view));
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async addMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() body: AddMemberRequestDto,
  ): Promise<void> {
    (await this.service.addMember(id, principal.userId, body.email, body.role)).unwrap();
  }

  @Patch(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async changeRole(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: ChangeMemberRoleRequestDto,
  ): Promise<void> {
    (await this.service.changeRole(id, principal.userId, userId, body.role)).unwrap();
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async removeMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    (await this.service.removeMember(id, principal.userId, userId)).unwrap();
  }

  @Get(':id/share-links')
  public async shareLinks(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ): Promise<ShareLinkResponse[]> {
    return (await this.service.shareLinks(id, principal.userId))
      .unwrap()
      .map((link: ShareLink): ShareLinkResponse => ProjectsPresenter.shareLink(link, this.clock));
  }

  @Post(':id/share-links')
  public async createShareLink(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() body: CreateShareLinkRequestDto,
  ): Promise<CreatedShareLinkResponse> {
    const created: CreatedShareLink = (
      await this.service.createShareLink(
        id,
        principal.userId,
        new ShareLinkSpec(body.role, body.expiresInDays ?? null, body.maxUses ?? null),
      )
    ).unwrap();
    return { link: ProjectsPresenter.shareLink(created.link, this.clock), token: created.token };
  }

  @Delete(':id/share-links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async revokeShareLink(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ): Promise<void> {
    (await this.service.revokeShareLink(id, principal.userId, linkId)).unwrap();
  }
}
