import { Injectable } from '@nestjs/common';
import { EntityId, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { ProjectRepository, ShareLinkRepository } from '../../domain/ports';
import { MemberSnapshot, Project, ProjectSnapshot } from '../../domain/project';
import { ShareLink, ShareLinkSnapshot } from '../../domain/share-link';

@Injectable()
export class InMemoryProjectRepository extends ProjectRepository {
  private readonly collection: InMemoryCollection<ProjectSnapshot> = new InMemoryCollection<ProjectSnapshot>();

  public override findById(id: EntityId): Promise<Optional<Project>> {
    return Promise.resolve(Optional.fromNullable(this.collection.get(id.toString())).map(Project.restore));
  }

  public override findByMember(userId: EntityId): Promise<Project[]> {
    const wanted: string = userId.toString();
    return Promise.resolve(
      this.collection
        .filter((p: ProjectSnapshot): boolean => p.members.some((m: MemberSnapshot): boolean => m.userId === wanted))
        .sort((a: ProjectSnapshot, b: ProjectSnapshot): number => b.createdAt.getTime() - a.createdAt.getTime())
        .map(Project.restore),
    );
  }

  public override save(project: Project): Promise<void> {
    this.collection.put(project.toSnapshot());
    return Promise.resolve();
  }
}

@Injectable()
export class InMemoryShareLinkRepository extends ShareLinkRepository {
  private readonly collection: InMemoryCollection<ShareLinkSnapshot> = new InMemoryCollection<ShareLinkSnapshot>();

  public override findById(id: EntityId): Promise<Optional<ShareLink>> {
    return Promise.resolve(Optional.fromNullable(this.collection.get(id.toString())).map(ShareLink.restore));
  }

  public override findByTokenHash(hash: string): Promise<Optional<ShareLink>> {
    return Promise.resolve(
      Optional.fromNullable(this.collection.find((l: ShareLinkSnapshot): boolean => l.tokenHash === hash)).map(
        ShareLink.restore,
      ),
    );
  }

  public override findByProject(projectId: EntityId): Promise<ShareLink[]> {
    const wanted: string = projectId.toString();
    return Promise.resolve(
      this.collection.filter((l: ShareLinkSnapshot): boolean => l.projectId === wanted).map(ShareLink.restore),
    );
  }

  public override save(link: ShareLink): Promise<void> {
    this.collection.put(link.toSnapshot());
    return Promise.resolve();
  }
}
