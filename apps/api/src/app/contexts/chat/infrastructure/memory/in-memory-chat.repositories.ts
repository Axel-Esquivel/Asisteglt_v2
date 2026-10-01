import { Injectable } from '@nestjs/common';
import { ConversationType } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { Conversation, ConversationSnapshot } from '../../domain/conversation';
import { Message, MessageSnapshot } from '../../domain/message';
import { ConversationRepository, MessageRepository, ReadMarkerRepository } from '../../domain/ports';
import { ReadMarker, ReadMarkerSnapshot } from '../../domain/read-marker';

@Injectable()
export class InMemoryConversationRepository extends ConversationRepository {
  private readonly collection: InMemoryCollection<ConversationSnapshot> =
    new InMemoryCollection<ConversationSnapshot>();

  public override findById(id: EntityId): Promise<Optional<Conversation>> {
    return this.one((c: ConversationSnapshot): boolean => c.id === id.toString());
  }

  public override findGlobal(): Promise<Optional<Conversation>> {
    return this.one((c: ConversationSnapshot): boolean => c.type === ConversationType.GLOBAL);
  }

  public override findByPairKey(pairKey: string): Promise<Optional<Conversation>> {
    return this.one((c: ConversationSnapshot): boolean => c.pairKey === pairKey);
  }

  public override findByProject(projectId: EntityId): Promise<Optional<Conversation>> {
    return this.one((c: ConversationSnapshot): boolean => c.projectId === projectId.toString());
  }

  public override findDirectFor(userId: EntityId): Promise<Conversation[]> {
    const wanted: string = userId.toString();
    return Promise.resolve(
      this.collection
        .filter(
          (c: ConversationSnapshot): boolean =>
            c.type === ConversationType.DIRECT && c.participantIds.includes(wanted),
        )
        .map(Conversation.restore),
    );
  }

  public override findByProjects(projectIds: ReadonlyArray<EntityId>): Promise<Conversation[]> {
    const wanted: Set<string> = new Set<string>(projectIds.map((id: EntityId): string => id.toString()));
    return Promise.resolve(
      this.collection
        .filter((c: ConversationSnapshot): boolean => c.projectId !== null && wanted.has(c.projectId))
        .map(Conversation.restore),
    );
  }

  public override save(conversation: Conversation): Promise<void> {
    this.collection.put(conversation.toSnapshot());
    return Promise.resolve();
  }

  private one(predicate: (c: ConversationSnapshot) => boolean): Promise<Optional<Conversation>> {
    return Promise.resolve(Optional.fromNullable(this.collection.find(predicate)).map(Conversation.restore));
  }
}

@Injectable()
export class InMemoryMessageRepository extends MessageRepository {
  private readonly collection: InMemoryCollection<MessageSnapshot> =
    new InMemoryCollection<MessageSnapshot>();

  public override findById(id: EntityId): Promise<Optional<Message>> {
    return Promise.resolve(Optional.fromNullable(this.collection.get(id.toString())).map(Message.restore));
  }

  public override page(conversationId: EntityId, before: Nullable<Date>, limit: number): Promise<Message[]> {
    const wanted: string = conversationId.toString();
    const items: MessageSnapshot[] = this.collection
      .filter(
        (m: MessageSnapshot): boolean =>
          m.conversationId === wanted && (before === null || m.sentAt.getTime() < before.getTime()),
      )
      .sort((a: MessageSnapshot, b: MessageSnapshot): number => a.sentAt.getTime() - b.sentAt.getTime());
    return Promise.resolve(items.slice(Math.max(0, items.length - limit)).map(Message.restore));
  }

  public override countAfter(
    conversationId: EntityId,
    after: Nullable<Date>,
    excludeSender: EntityId,
  ): Promise<number> {
    const wanted: string = conversationId.toString();
    const sender: string = excludeSender.toString();
    return Promise.resolve(
      this.collection.filter(
        (m: MessageSnapshot): boolean =>
          m.conversationId === wanted &&
          m.senderId !== sender &&
          m.deletedAt === null &&
          (after === null || m.sentAt.getTime() > after.getTime()),
      ).length,
    );
  }

  public override save(message: Message): Promise<void> {
    this.collection.put(message.toSnapshot());
    return Promise.resolve();
  }
}

@Injectable()
export class InMemoryReadMarkerRepository extends ReadMarkerRepository {
  private readonly collection: InMemoryCollection<ReadMarkerSnapshot> =
    new InMemoryCollection<ReadMarkerSnapshot>();

  public override find(conversationId: EntityId, userId: EntityId): Promise<Optional<ReadMarker>> {
    const key: string = ReadMarker.key(conversationId.toString(), userId.toString());
    return Promise.resolve(Optional.fromNullable(this.collection.get(key)).map(ReadMarker.restore));
  }

  public override save(marker: ReadMarker): Promise<void> {
    this.collection.put(marker.toSnapshot());
    return Promise.resolve();
  }
}
