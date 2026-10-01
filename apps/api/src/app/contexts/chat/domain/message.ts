import { AggregateRoot, Clock, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { ChatErrors } from './chat-errors';
import { ChatPrincipal } from './chat-principal';
import { Conversation } from './conversation';

export interface MessageSnapshot {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly text: string;
  readonly sentAt: Date;
  readonly editedAt: Nullable<Date>;
  readonly deletedAt: Nullable<Date>;
}

/** Texto de un mensaje, normalizado y con longitud acotada. */
export class MessageBody {
  private static readonly MAX_LENGTH: number = 4000;

  private constructor(public readonly text: string) {}

  public static create(raw: string): Result<MessageBody> {
    const text: string = raw.replace(/\r\n/g, '\n').trim();
    return text.length === 0 || text.length > MessageBody.MAX_LENGTH
      ? Result.fail(ChatErrors.invalidMessage())
      : Result.ok(new MessageBody(text));
  }
}

export class Message extends AggregateRoot {
  private constructor(
    id: EntityId,
    private readonly conversationId: EntityId,
    private readonly senderId: EntityId,
    private text: string,
    private readonly sentAt: Date,
    private editedAt: Nullable<Date>,
    private deletedAt: Nullable<Date>,
  ) {
    super(id);
  }

  public static post(
    conversation: Conversation,
    sender: ChatPrincipal,
    body: MessageBody,
    clock: Clock,
  ): Result<Message> {
    if (!conversation.admits(sender)) {
      return Result.fail(ChatErrors.conversationNotFound());
    }
    const now: Date = clock.now();
    conversation.touch(now);
    return Result.ok(
      new Message(EntityId.generate(), conversation.getId(), sender.userId, body.text, now, null, null),
    );
  }

  public static restore(s: MessageSnapshot): Message {
    return new Message(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.conversationId).unwrap(),
      EntityId.fromString(s.senderId).unwrap(),
      s.text,
      s.sentAt,
      s.editedAt,
      s.deletedAt,
    );
  }

  public getConversationId(): EntityId {
    return this.conversationId;
  }

  public getSenderId(): EntityId {
    return this.senderId;
  }

  public edit(editor: EntityId, body: MessageBody, clock: Clock): Result<Message> {
    if (!editor.equals(this.senderId)) {
      return Result.fail(ChatErrors.notAuthor());
    }
    if (this.deletedAt !== null) {
      return Result.fail(ChatErrors.messageNotFound());
    }
    this.text = body.text;
    this.editedAt = clock.now();
    return Result.ok(this);
  }

  public softDelete(actor: EntityId, clock: Clock): Result<Message> {
    if (!actor.equals(this.senderId)) {
      return Result.fail(ChatErrors.notAuthor());
    }
    if (this.deletedAt === null) {
      this.deletedAt = clock.now();
      this.text = '';
    }
    return Result.ok(this);
  }

  public toSnapshot(): MessageSnapshot {
    return {
      id: this.id.toString(),
      conversationId: this.conversationId.toString(),
      senderId: this.senderId.toString(),
      text: this.text,
      sentAt: this.sentAt,
      editedAt: this.editedAt,
      deletedAt: this.deletedAt,
    };
  }
}
