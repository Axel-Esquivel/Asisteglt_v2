import { EntityId, Optional } from '@asisteglt/shared-kernel';
import { Project } from './project';
import { ShareLink } from './share-link';

export abstract class ProjectRepository {
  public abstract findById(id: EntityId): Promise<Optional<Project>>;
  public abstract findByMember(userId: EntityId): Promise<Project[]>;
  public abstract save(project: Project): Promise<void>;
}

export abstract class ShareLinkRepository {
  public abstract findById(id: EntityId): Promise<Optional<ShareLink>>;
  public abstract findByTokenHash(hash: string): Promise<Optional<ShareLink>>;
  public abstract findByProject(projectId: EntityId): Promise<ShareLink[]>;
  public abstract save(link: ShareLink): Promise<void>;
}
