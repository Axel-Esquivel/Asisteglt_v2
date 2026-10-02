import { ConversationType } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { FieldDecoder, FieldReader } from '@asisteglt/web-core';

const TYPES: ReadonlyArray<ConversationType> = Object.values(ConversationType);

export class ConversationSummary {
  public constructor(
    public readonly id: string,
    public readonly type: ConversationType,
    public readonly title: string,
    public readonly projectId: Nullable<string>,
    public readonly counterpartId: Nullable<string>,
    public readonly lastMessageAt: Nullable<Date>,
    public readonly unread: number,
  ) {}

  public static decoder(): FieldDecoder<ConversationSummary> {
    return new FieldDecoder<ConversationSummary>(
      (f: FieldReader): ConversationSummary =>
        new ConversationSummary(
          f.string('id'),
          f.oneOf('type', TYPES),
          f.string('title'),
          f.nullableString('projectId'),
          f.nullableString('counterpartId'),
          f.nullableDate('lastMessageAt'),
          f.number('unread'),
        ),
    );
  }

  public icon(): string {
    switch (this.type) {
      case ConversationType.GLOBAL:
        return 'pi pi-globe';
      case ConversationType.PROJECT:
        return 'pi pi-folder';
      case ConversationType.DIRECT:
        return 'pi pi-user';
    }
  }

  public subtitle(): string {
    switch (this.type) {
      case ConversationType.GLOBAL:
        return 'Todas las personas';
      case ConversationType.PROJECT:
        return 'Proyecto';
      case ConversationType.DIRECT:
        return 'Mensaje directo';
    }
  }

  public withActivity(at: Date, unread: number): ConversationSummary {
    return new ConversationSummary(
      this.id,
      this.type,
      this.title,
      this.projectId,
      this.counterpartId,
      at,
      unread,
    );
  }

  public withUnread(unread: number): ConversationSummary {
    return new ConversationSummary(
      this.id,
      this.type,
      this.title,
      this.projectId,
      this.counterpartId,
      this.lastMessageAt,
      unread,
    );
  }

  /** Orden de la lista: global primero y luego por actividad reciente. */
  public static compare(a: ConversationSummary, b: ConversationSummary): number {
    if (a.type === ConversationType.GLOBAL || b.type === ConversationType.GLOBAL) {
      return a.type === ConversationType.GLOBAL ? -1 : 1;
    }
    const left: number = a.lastMessageAt === null ? 0 : a.lastMessageAt.getTime();
    const right: number = b.lastMessageAt === null ? 0 : b.lastMessageAt.getTime();
    return right - left || a.title.localeCompare(b.title);
  }
}

export class ChatMessage {
  public constructor(
    public readonly id: string,
    public readonly conversationId: string,
    public readonly senderId: string,
    public readonly senderName: string,
    public readonly text: string,
    public readonly sentAt: Date,
    public readonly editedAt: Nullable<Date>,
    public readonly deleted: boolean,
  ) {}

  public static decoder(): FieldDecoder<ChatMessage> {
    return new FieldDecoder<ChatMessage>(
      (f: FieldReader): ChatMessage =>
        new ChatMessage(
          f.string('id'),
          f.string('conversationId'),
          f.string('senderId'),
          f.string('senderName'),
          f.string('text'),
          f.date('sentAt'),
          f.nullableDate('editedAt'),
          f.boolean('deleted'),
        ),
    );
  }
}

export class PresenceChange {
  public constructor(
    public readonly userId: string,
    public readonly online: boolean,
  ) {}

  public static decoder(): FieldDecoder<PresenceChange> {
    return new FieldDecoder<PresenceChange>(
      (f: FieldReader): PresenceChange => new PresenceChange(f.string('userId'), f.boolean('online')),
    );
  }
}

export class UserMatch {
  public constructor(
    public readonly id: string,
    public readonly displayName: string,
    public readonly email: string,
  ) {}

  public static decoder(): FieldDecoder<UserMatch> {
    return new FieldDecoder<UserMatch>(
      (f: FieldReader): UserMatch =>
        new UserMatch(f.string('id'), f.string('displayName'), f.string('email')),
    );
  }

  public label(): string {
    return `${this.displayName} · ${this.email}`;
  }
}
