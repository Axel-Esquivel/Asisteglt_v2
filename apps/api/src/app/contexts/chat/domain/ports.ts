import { ChatMessageResponse, PresenceChangedEvent } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Conversation } from './conversation';
import { Message } from './message';
import { ReadMarker } from './read-marker';

export abstract class ConversationRepository {
  public abstract findById(id: EntityId): Promise<Optional<Conversation>>;
  public abstract findGlobal(): Promise<Optional<Conversation>>;
  public abstract findByPairKey(pairKey: string): Promise<Optional<Conversation>>;
  public abstract findByProject(projectId: EntityId): Promise<Optional<Conversation>>;
  public abstract findDirectFor(userId: EntityId): Promise<Conversation[]>;
  public abstract findByProjects(projectIds: ReadonlyArray<EntityId>): Promise<Conversation[]>;
  public abstract save(conversation: Conversation): Promise<void>;
}

export abstract class MessageRepository {
  public abstract findById(id: EntityId): Promise<Optional<Message>>;
  /** Mensajes anteriores a `before` (o los últimos), en orden cronológico. */
  public abstract page(conversationId: EntityId, before: Nullable<Date>, limit: number): Promise<Message[]>;
  public abstract countAfter(conversationId: EntityId, after: Nullable<Date>, excludeSender: EntityId): Promise<number>;
  public abstract save(message: Message): Promise<void>;
}

export abstract class ReadMarkerRepository {
  public abstract find(conversationId: EntityId, userId: EntityId): Promise<Optional<ReadMarker>>;
  public abstract save(marker: ReadMarker): Promise<void>;
}

/** Presencia en línea (memoria en un nodo; Redis cuando hay varias instancias). */
export abstract class PresenceTracker {
  /** Devuelve `true` si es la primera conexión del usuario (pasó a en línea). */
  public abstract markOnline(userId: EntityId, socketId: string): Promise<boolean>;
  /** Devuelve `true` si era la última conexión del usuario (pasó a desconectado). */
  public abstract markOffline(userId: EntityId, socketId: string): Promise<boolean>;
  public abstract onlineUsers(): Promise<string[]>;
}

/** Destino de un evento en tiempo real. */
export abstract class RealtimeAudience {
  public abstract rooms(): string[];
}

export class UsersAudience extends RealtimeAudience {
  public constructor(private readonly userIds: ReadonlyArray<EntityId>) {
    super();
  }

  public static room(userId: string): string {
    return `user:${userId}`;
  }

  public override rooms(): string[] {
    return this.userIds.map((id: EntityId): string => UsersAudience.room(id.toString()));
  }
}

export class EveryoneAudience extends RealtimeAudience {
  public static readonly ROOM: string = 'everyone';

  public override rooms(): string[] {
    return [EveryoneAudience.ROOM];
  }
}

/** Publica eventos hacia los clientes conectados. */
export abstract class RealtimeEventPublisher {
  public abstract chatMessage(audience: RealtimeAudience, message: ChatMessageResponse, updated: boolean): void;
  public abstract presenceChanged(event: PresenceChangedEvent): void;
}
