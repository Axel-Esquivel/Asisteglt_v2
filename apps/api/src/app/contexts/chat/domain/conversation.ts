import { ConversationType } from '@asisteglt/shared-contracts';
import { AggregateRoot, EntityId, Nullable } from '@asisteglt/shared-kernel';
import { ChatPrincipal } from './chat-principal';

export interface ConversationSnapshot {
  readonly id: string;
  readonly type: ConversationType;
  readonly pairKey: Nullable<string>;
  readonly participantIds: ReadonlyArray<string>;
  readonly projectId: Nullable<string>;
  readonly createdAt: Date;
  readonly lastMessageAt: Nullable<Date>;
}

/** Conversación de chat; cada tipo decide quién puede participar. */
export abstract class Conversation extends AggregateRoot {
  protected constructor(
    id: EntityId,
    protected readonly createdAt: Date,
    protected lastMessageAt: Nullable<Date>,
  ) {
    super(id);
  }

  public static restore(s: ConversationSnapshot): Conversation {
    const id: EntityId = EntityId.fromString(s.id).unwrap();
    switch (s.type) {
      case ConversationType.GLOBAL:
        return new GlobalConversation(id, s.createdAt, s.lastMessageAt);
      case ConversationType.DIRECT: {
        const [first, second] = s.participantIds;
        return new DirectConversation(
          id,
          EntityId.fromString(first ?? '').unwrap(),
          EntityId.fromString(second ?? '').unwrap(),
          s.createdAt,
          s.lastMessageAt,
        );
      }
      case ConversationType.PROJECT:
        return new ProjectConversation(id, EntityId.fromString(s.projectId ?? '').unwrap(), s.createdAt, s.lastMessageAt);
    }
  }

  public abstract type(): ConversationType;
  public abstract admits(principal: ChatPrincipal): boolean;
  protected abstract details(): Pick<ConversationSnapshot, 'pairKey' | 'participantIds' | 'projectId'>;

  public getLastMessageAt(): Nullable<Date> {
    return this.lastMessageAt;
  }

  public touch(at: Date): void {
    this.lastMessageAt = at;
  }

  public toSnapshot(): ConversationSnapshot {
    return {
      id: this.id.toString(),
      type: this.type(),
      ...this.details(),
      createdAt: this.createdAt,
      lastMessageAt: this.lastMessageAt,
    };
  }
}

/** Sala común para todas las personas registradas. */
export class GlobalConversation extends Conversation {
  public constructor(id: EntityId, createdAt: Date, lastMessageAt: Nullable<Date>) {
    super(id, createdAt, lastMessageAt);
  }

  public static open(at: Date): GlobalConversation {
    return new GlobalConversation(EntityId.generate(), at, null);
  }

  public override type(): ConversationType {
    return ConversationType.GLOBAL;
  }

  public override admits(_principal: ChatPrincipal): boolean {
    return true;
  }

  protected override details(): Pick<ConversationSnapshot, 'pairKey' | 'participantIds' | 'projectId'> {
    return { pairKey: null, participantIds: [], projectId: null };
  }
}

/** Conversación privada entre dos personas; `pairKey` la hace única por pareja. */
export class DirectConversation extends Conversation {
  public constructor(
    id: EntityId,
    private readonly firstUserId: EntityId,
    private readonly secondUserId: EntityId,
    createdAt: Date,
    lastMessageAt: Nullable<Date>,
  ) {
    super(id, createdAt, lastMessageAt);
  }

  public static between(a: EntityId, b: EntityId, at: Date): DirectConversation {
    const [first, second] = DirectConversation.ordered(a, b);
    return new DirectConversation(EntityId.generate(), first, second, at, null);
  }

  public static pairKey(a: EntityId, b: EntityId): string {
    return DirectConversation.ordered(a, b)
      .map((id: EntityId): string => id.toString())
      .join(':');
  }

  private static ordered(a: EntityId, b: EntityId): [EntityId, EntityId] {
    return a.toString() < b.toString() ? [a, b] : [b, a];
  }

  public override type(): ConversationType {
    return ConversationType.DIRECT;
  }

  public override admits(principal: ChatPrincipal): boolean {
    return principal.userId.equals(this.firstUserId) || principal.userId.equals(this.secondUserId);
  }

  public participants(): EntityId[] {
    return [this.firstUserId, this.secondUserId];
  }

  public counterpartOf(userId: EntityId): EntityId {
    return userId.equals(this.firstUserId) ? this.secondUserId : this.firstUserId;
  }

  protected override details(): Pick<ConversationSnapshot, 'pairKey' | 'participantIds' | 'projectId'> {
    return {
      pairKey: DirectConversation.pairKey(this.firstUserId, this.secondUserId),
      participantIds: [this.firstUserId.toString(), this.secondUserId.toString()],
      projectId: null,
    };
  }
}

/** Conversación de los miembros de un proyecto. */
export class ProjectConversation extends Conversation {
  public constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    createdAt: Date,
    lastMessageAt: Nullable<Date>,
  ) {
    super(id, createdAt, lastMessageAt);
  }

  public static forProject(projectId: EntityId, at: Date): ProjectConversation {
    return new ProjectConversation(EntityId.generate(), projectId, at, null);
  }

  public getProjectId(): EntityId {
    return this.projectId;
  }

  public override type(): ConversationType {
    return ConversationType.PROJECT;
  }

  public override admits(principal: ChatPrincipal): boolean {
    return principal.isMemberOf(this.projectId);
  }

  protected override details(): Pick<ConversationSnapshot, 'pairKey' | 'participantIds' | 'projectId'> {
    return { pairKey: null, participantIds: [], projectId: this.projectId.toString() };
  }
}
