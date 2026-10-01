import { EntityId } from '@asisteglt/shared-kernel';

/** Quién participa en el chat y en qué proyectos es miembro. */
export class ChatPrincipal {
  public constructor(
    public readonly userId: EntityId,
    private readonly projectIds: ReadonlyArray<EntityId>,
  ) {}

  public isMemberOf(projectId: EntityId): boolean {
    return this.projectIds.some((id: EntityId): boolean => id.equals(projectId));
  }
}
