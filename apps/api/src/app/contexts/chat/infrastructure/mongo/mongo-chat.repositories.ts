import { Injectable } from '@nestjs/common';
import { ConversationType } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { QueryFilter, Model } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { Conversation } from '../../domain/conversation';
import { Message } from '../../domain/message';
import { ConversationRepository, MessageRepository, ReadMarkerRepository } from '../../domain/ports';
import { ReadMarker } from '../../domain/read-marker';
import {
  CONVERSATION_SCHEMA,
  ConversationRecord,
  MESSAGE_SCHEMA,
  MessageRecord,
  READ_MARKER_SCHEMA,
  ReadMarkerRecord,
} from './chat.schemas';

const toConversation = (record: ConversationRecord): Conversation => {
  const { _id, ...rest } = record;
  return Conversation.restore({ ...rest, id: _id });
};

const toMessage = (record: MessageRecord): Message => {
  const { _id, ...rest } = record;
  return Message.restore({ ...rest, id: _id });
};

@Injectable()
export class MongoConversationRepository extends ConversationRepository {
  private readonly model: Model<ConversationRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ConversationRecord>('Conversation', CONVERSATION_SCHEMA);
  }

  public override findById(id: EntityId): Promise<Optional<Conversation>> {
    return this.one({ _id: id.toString() });
  }

  public override findGlobal(): Promise<Optional<Conversation>> {
    return this.one({ type: ConversationType.GLOBAL });
  }

  public override findByPairKey(pairKey: string): Promise<Optional<Conversation>> {
    return this.one({ pairKey });
  }

  public override findByProject(projectId: EntityId): Promise<Optional<Conversation>> {
    return this.one({ projectId: projectId.toString() });
  }

  public override async findDirectFor(userId: EntityId): Promise<Conversation[]> {
    const records: ConversationRecord[] = await this.model
      .find({ type: ConversationType.DIRECT, participantIds: userId.toString() })
      .lean<ConversationRecord[]>()
      .exec();
    return records.map(toConversation);
  }

  public override async findByProjects(projectIds: ReadonlyArray<EntityId>): Promise<Conversation[]> {
    const records: ConversationRecord[] = await this.model
      .find({ projectId: { $in: projectIds.map((id: EntityId): string => id.toString()) } })
      .lean<ConversationRecord[]>()
      .exec();
    return records.map(toConversation);
  }

  public override async save(conversation: Conversation): Promise<void> {
    const { id, ...rest } = conversation.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }

  private async one(filter: QueryFilter<ConversationRecord>): Promise<Optional<Conversation>> {
    const record: Nullable<ConversationRecord> = await this.model
      .findOne(filter)
      .lean<ConversationRecord>()
      .exec();
    return Optional.fromNullable(record).map(toConversation);
  }
}

@Injectable()
export class MongoMessageRepository extends MessageRepository {
  private readonly model: Model<MessageRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<MessageRecord>('Message', MESSAGE_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<Message>> {
    const record: Nullable<MessageRecord> = await this.model
      .findById(id.toString())
      .lean<MessageRecord>()
      .exec();
    return Optional.fromNullable(record).map(toMessage);
  }

  public override async page(
    conversationId: EntityId,
    before: Nullable<Date>,
    limit: number,
  ): Promise<Message[]> {
    const filter: QueryFilter<MessageRecord> =
      before === null
        ? { conversationId: conversationId.toString() }
        : { conversationId: conversationId.toString(), sentAt: { $lt: before } };
    const records: MessageRecord[] = await this.model
      .find(filter)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean<MessageRecord[]>()
      .exec();
    return records.reverse().map(toMessage);
  }

  public override countAfter(
    conversationId: EntityId,
    after: Nullable<Date>,
    excludeSender: EntityId,
  ): Promise<number> {
    const base: QueryFilter<MessageRecord> = {
      conversationId: conversationId.toString(),
      senderId: { $ne: excludeSender.toString() },
      deletedAt: null,
    };
    return this.model.countDocuments(after === null ? base : { ...base, sentAt: { $gt: after } }).exec();
  }

  public override async save(message: Message): Promise<void> {
    const { id, ...rest } = message.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}

@Injectable()
export class MongoReadMarkerRepository extends ReadMarkerRepository {
  private readonly model: Model<ReadMarkerRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ReadMarkerRecord>('ReadMarker', READ_MARKER_SCHEMA);
  }

  public override async find(conversationId: EntityId, userId: EntityId): Promise<Optional<ReadMarker>> {
    const key: string = ReadMarker.key(conversationId.toString(), userId.toString());
    const record: Nullable<ReadMarkerRecord> = await this.model.findById(key).lean<ReadMarkerRecord>().exec();
    return Optional.fromNullable(record).map((r: ReadMarkerRecord): ReadMarker => {
      const { _id, ...rest } = r;
      return ReadMarker.restore({ ...rest, id: _id });
    });
  }

  public override async save(marker: ReadMarker): Promise<void> {
    const { id, ...rest } = marker.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}
