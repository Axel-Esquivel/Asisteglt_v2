import { Injectable } from '@angular/core';
import {
  AddMemberRequest,
  CreateProjectRequest,
  CreateShareLinkRequest,
  ProjectRole,
  UpdateProjectRequest,
} from '@asisteglt/shared-contracts';
import { Result } from '@asisteglt/shared-kernel';
import { ApiClient, ArrayDecoder, EmptyDecoder, FieldDecoder } from '@asisteglt/web-core';
import { CreatedShareLink, ProjectMemberView, ProjectSummary, ShareLinkView } from './project.model';

@Injectable({ providedIn: 'root' })
export class ProjectsApiClient extends ApiClient {
  private readonly project: FieldDecoder<ProjectSummary> = ProjectSummary.decoder();
  private readonly projects: ArrayDecoder<ProjectSummary> = new ArrayDecoder<ProjectSummary>(ProjectSummary.decoder());
  private readonly members: ArrayDecoder<ProjectMemberView> = new ArrayDecoder<ProjectMemberView>(
    ProjectMemberView.decoder(),
  );
  private readonly links: ArrayDecoder<ShareLinkView> = new ArrayDecoder<ShareLinkView>(ShareLinkView.decoder());
  private readonly empty: EmptyDecoder = new EmptyDecoder();

  public list(): Promise<Result<ProjectSummary[]>> {
    return this.get('projects', this.projects);
  }

  public find(id: string): Promise<Result<ProjectSummary>> {
    return this.get(`projects/${encodeURIComponent(id)}`, this.project);
  }

  public create(request: CreateProjectRequest): Promise<Result<ProjectSummary>> {
    return this.post('projects', request, this.project);
  }

  public update(id: string, request: UpdateProjectRequest): Promise<Result<ProjectSummary>> {
    return this.patch(`projects/${encodeURIComponent(id)}`, request, this.project);
  }

  public join(token: string): Promise<Result<ProjectSummary>> {
    return this.post('projects/join', { token }, this.project);
  }

  public memberList(id: string): Promise<Result<ProjectMemberView[]>> {
    return this.get(`projects/${encodeURIComponent(id)}/members`, this.members);
  }

  public addMember(id: string, request: AddMemberRequest): Promise<Result<true>> {
    return this.post(`projects/${encodeURIComponent(id)}/members`, request, this.empty);
  }

  public changeRole(id: string, userId: string, role: ProjectRole): Promise<Result<true>> {
    return this.patch(`projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { role }, this.empty);
  }

  public removeMember(id: string, userId: string): Promise<Result<true>> {
    return this.delete(`projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, this.empty);
  }

  public shareLinks(id: string): Promise<Result<ShareLinkView[]>> {
    return this.get(`projects/${encodeURIComponent(id)}/share-links`, this.links);
  }

  public createShareLink(id: string, request: CreateShareLinkRequest): Promise<Result<CreatedShareLink>> {
    return this.post(`projects/${encodeURIComponent(id)}/share-links`, request, CreatedShareLink.decoder());
  }

  public revokeShareLink(id: string, linkId: string): Promise<Result<true>> {
    return this.delete(`projects/${encodeURIComponent(id)}/share-links/${encodeURIComponent(linkId)}`, this.empty);
  }
}
