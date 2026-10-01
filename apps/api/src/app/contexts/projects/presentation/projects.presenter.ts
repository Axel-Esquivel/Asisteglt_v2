import { MemberResponse, ProjectResponse, ProjectRole, ShareLinkResponse } from '@asisteglt/shared-contracts';
import { Clock, EntityId } from '@asisteglt/shared-kernel';
import { MemberView } from '../application/project.service';
import { Project } from '../domain/project';
import { ShareLink } from '../domain/share-link';

export class ProjectsPresenter {
  public static project(project: Project, viewer: EntityId): ProjectResponse {
    return {
      id: project.getId().toString(),
      name: project.getName(),
      description: project.getDescription(),
      moduleType: project.getModuleType(),
      ownerId: project.getOwnerId().toString(),
      memberCount: project.getMembers().length,
      myRole: project.roleOf(viewer) ?? ProjectRole.VIEWER,
      myPermissions: project.permissionsOf(viewer),
      createdAt: project.getCreatedAt().toISOString(),
    };
  }

  public static member(view: MemberView): MemberResponse {
    return {
      userId: view.member.userId.toString(),
      displayName: view.user === null ? 'Usuario eliminado' : view.user.getDisplayName(),
      email: view.user === null ? '' : view.user.getEmail().toString(),
      role: view.member.role,
      joinedAt: view.member.joinedAt.toISOString(),
    };
  }

  public static shareLink(link: ShareLink, clock: Clock): ShareLinkResponse {
    const s = link.toSnapshot();
    return {
      id: s.id,
      role: s.role,
      expiresAt: s.expiresAt === null ? null : s.expiresAt.toISOString(),
      maxUses: s.maxUses,
      uses: s.uses,
      active: link.isUsable(clock),
      createdAt: s.createdAt.toISOString(),
    };
  }
}
