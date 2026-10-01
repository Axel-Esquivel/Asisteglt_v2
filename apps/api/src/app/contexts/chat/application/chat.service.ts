import { Injectable } from '@nestjs/common';
import { ChatMessageResponse } from '@asisteglt/shared-contracts';
import { Clock, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { UserDirectory } from '../../iam/application/user-directory';
import { User } from '../../iam/domain/user';
import { ProjectAccess } from '../../projects/application/project-access';
import { Project, ProjectMember } from '../../projects/domain/project';
import { ProjectRepository } from '../../projects/domain/ports';
import { ChatErrors } from '../domain/chat-errors';
import { ChatPrincipal } from '../domain/chat-principal';
import {
  Conversation,
  DirectConversation,
  GlobalConversation,
  ProjectConversation,
} from '../domain/conversation';
import { Message, MessageBody } from '../domain/message';
import {
  ConversationRepository,
  EveryoneAudience,
  MessageRepository,
  ReadMarkerRepository,
  RealtimeAudience,
  RealtimeEventPublisher,
  UsersAudience,
} from '../domain/ports';
import { ReadMarker } from '../domain/read-marker';

/** Conversación con los datos que necesita la vista del usuario. */
export class ConversationView {
  public constructor(
    public readonly conversation: Conversation,
    public readonly title: string,
    public readonly counterpartId: Nullable<string>,
    public readonly unread: number,
  ) {}
}

/** Casos de uso del chat: conversaciones, mensajes, lecturas y difusión en tiempo real. */
@Injectable()
export class ChatService {
  private static readonly PAGE_SIZE: number = 50;

  public constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly markers: ReadMarkerRepository,
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccess,
    private readonly directory: UserDirectory,
    private readonly publisher: RealtimeEventPublisher,
    private readonly clock: Clock,
  ) {}

  public async list(userId: EntityId): Promise<ConversationView[]> {
    const myProjects: Project[] = await this.projects.findByMember(userId);
    const global: Conversation = await this.globalConversation();
    const projectConversations: Conversation[] = await Promise.all(
      myProjects.map((p: Project): Promise<Conversation> => this.projectConversationOf(p.getId())),
    );
    const directs: Conversation[] = await this.conversations.findDirectFor(userId);
    const counterpartIds: EntityId[] = directs
      .filter((c: Conversation): c is DirectConversation => c instanceof DirectConversation)
      .map((c: DirectConversation): EntityId => c.counterpartOf(userId));
    const users: User[] = await this.directory.findMany(counterpartIds);
    const views: ConversationView[] = [];
    views.push(await this.view(global, userId, 'Chat general', null));
    for (const conversation of projectConversations) {
      const project: Nullable<Project> =
        conversation instanceof ProjectConversation
          ? (myProjects.find((p: Project): boolean => p.getId().equals(conversation.getProjectId())) ?? null)
          : null;
      views.push(
        await this.view(conversation, userId, project === null ? 'Proyecto' : project.getName(), null),
      );
    }
    for (const conversation of directs) {
      if (conversation instanceof DirectConversation) {
        const other: EntityId = conversation.counterpartOf(userId);
        const user: Nullable<User> = users.find((u: User): boolean => u.getId().equals(other)) ?? null;
        views.push(
          await this.view(
            conversation,
            userId,
            user === null ? 'Usuario eliminado' : user.getDisplayName(),
            other.toString(),
          ),
        );
      }
    }
    return views;
  }

  public async openDirect(userId: EntityId, targetId: string): Promise<Result<ConversationView>> {
    const target: Result<EntityId> = EntityId.fromString(targetId);
    if (!target.isOk() || target.unwrap().equals(userId)) {
      return Result.fail(ChatErrors.invalidDirectTarget());
    }
    const other: Nullable<User> = (await this.directory.findById(target.unwrap())).toNullable();
    if (other === null) {
      return Result.fail(ChatErrors.invalidDirectTarget());
    }
    const key: string = DirectConversation.pairKey(userId, other.getId());
    const existing: Nullable<Conversation> = (await this.conversations.findByPairKey(key)).toNullable();
    const conversation: Conversation =
      existing ?? DirectConversation.between(userId, other.getId(), this.clock.now());
    if (existing === null) {
      await this.conversations.save(conversation);
    }
    return Result.ok(await this.view(conversation, userId, other.getDisplayName(), other.getId().toString()));
  }

  public async forProject(userId: EntityId, projectId: string): Promise<Result<ConversationView>> {
    const project: Result<Project> = await this.access.load(projectId, userId);
    if (!project.isOk()) {
      return Result.fail(ChatErrors.conversationNotFound());
    }
    const conversation: Conversation = await this.projectConversationOf(project.unwrap().getId());
    return Result.ok(await this.view(conversation, userId, project.unwrap().getName(), null));
  }

  public async history(
    userId: EntityId,
    conversationId: string,
    before: Nullable<Date>,
  ): Promise<Result<ChatMessageResponse[]>> {
    const conversation: Result<Conversation> = await this.admitted(userId, conversationId);
    if (!conversation.isOk()) {
      return Result.fail(ChatErrors.conversationNotFound());
    }
    const page: Message[] = await this.messages.page(
      conversation.unwrap().getId(),
      before,
      ChatService.PAGE_SIZE,
    );
    return Result.ok(await this.present(page));
  }

  public async post(
    userId: EntityId,
    conversationId: string,
    text: string,
  ): Promise<Result<ChatMessageResponse>> {
    const conversation: Result<Conversation> = await this.admitted(userId, conversationId);
    const body: Result<MessageBody> = MessageBody.create(text);
    if (!conversation.isOk()) {
      return Result.fail(ChatErrors.conversationNotFound());
    }
    if (!body.isOk()) {
      return Result.fail(ChatErrors.invalidMessage());
    }
    const target: Conversation = conversation.unwrap();
    const message: Result<Message> = Message.post(
      target,
      await this.principal(userId),
      body.unwrap(),
      this.clock,
    );
    if (!message.isOk()) {
      return Result.fail(ChatErrors.conversationNotFound());
    }
    await this.messages.save(message.unwrap());
    await this.conversations.save(target);
    await this.markRead(userId, conversationId);
    return Result.ok(await this.broadcast(target, message.unwrap(), false));
  }

  public async edit(userId: EntityId, messageId: string, text: string): Promise<Result<ChatMessageResponse>> {
    const body: Result<MessageBody> = MessageBody.create(text);
    if (!body.isOk()) {
      return Result.fail(ChatErrors.invalidMessage());
    }
    return this.changeMessage(userId, messageId, (m: Message): Result<Message> =>
      m.edit(userId, body.unwrap(), this.clock),
    );
  }

  public remove(userId: EntityId, messageId: string): Promise<Result<ChatMessageResponse>> {
    return this.changeMessage(userId, messageId, (m: Message): Result<Message> =>
      m.softDelete(userId, this.clock),
    );
  }

  public async markRead(userId: EntityId, conversationId: string): Promise<Result<true>> {
    const conversation: Result<Conversation> = await this.admitted(userId, conversationId);
    if (!conversation.isOk()) {
      return Result.fail(ChatErrors.conversationNotFound());
    }
    const id: EntityId = conversation.unwrap().getId();
    const now: Date = this.clock.now();
    const marker: ReadMarker = (await this.markers.find(id, userId)).orElseGet((): ReadMarker =>
      ReadMarker.start(id.toString(), userId.toString(), now),
    );
    marker.advanceTo(now);
    await this.markers.save(marker);
    return Result.ok(true);
  }

  private async changeMessage(
    userId: EntityId,
    messageId: string,
    change: (message: Message) => Result<Message>,
  ): Promise<Result<ChatMessageResponse>> {
    const id: Result<EntityId> = EntityId.fromString(messageId);
    const message: Nullable<Message> = id.isOk()
      ? (await this.messages.findById(id.unwrap())).toNullable()
      : null;
    if (message === null) {
      return Result.fail(ChatErrors.messageNotFound());
    }
    const conversation: Result<Conversation> = await this.admitted(
      userId,
      message.getConversationId().toString(),
    );
    if (!conversation.isOk()) {
      return Result.fail(ChatErrors.messageNotFound());
    }
    const changed: Result<Message> = change(message);
    if (!changed.isOk()) {
      return Result.fail(changed.errorOrNull() ?? ChatErrors.messageNotFound());
    }
    await this.messages.save(message);
    return Result.ok(await this.broadcast(conversation.unwrap(), message, true));
  }

  private async broadcast(
    conversation: Conversation,
    message: Message,
    updated: boolean,
  ): Promise<ChatMessageResponse> {
    const [payload] = await this.present([message]);
    const response: ChatMessageResponse = payload ?? ChatService.fallback(message);
    this.publisher.chatMessage(await this.audienceOf(conversation), response, updated);
    return response;
  }

  private async audienceOf(conversation: Conversation): Promise<RealtimeAudience> {
    if (conversation instanceof DirectConversation) {
      return new UsersAudience(conversation.participants());
    }
    if (conversation instanceof ProjectConversation) {
      const project: Nullable<Project> = (
        await this.projects.findById(conversation.getProjectId())
      ).toNullable();
      return new UsersAudience(
        project === null ? [] : project.getMembers().map((m: ProjectMember): EntityId => m.userId),
      );
    }
    return new EveryoneAudience();
  }

  private async admitted(userId: EntityId, conversationId: string): Promise<Result<Conversation>> {
    const id: Result<EntityId> = EntityId.fromString(conversationId);
    if (!id.isOk()) {
      return Result.fail(ChatErrors.conversationNotFound());
    }
    const principal: ChatPrincipal = await this.principal(userId);
    const conversation: Nullable<Conversation> = (await this.conversations.findById(id.unwrap()))
      .filter((c: Conversation): boolean => c.admits(principal))
      .toNullable();
    return conversation === null ? Result.fail(ChatErrors.conversationNotFound()) : Result.ok(conversation);
  }

  private async principal(userId: EntityId): Promise<ChatPrincipal> {
    const projects: Project[] = await this.projects.findByMember(userId);
    return new ChatPrincipal(
      userId,
      projects.map((p: Project): EntityId => p.getId()),
    );
  }

  private async globalConversation(): Promise<Conversation> {
    const existing: Nullable<Conversation> = (await this.conversations.findGlobal()).toNullable();
    if (existing !== null) {
      return existing;
    }
    const created: Conversation = GlobalConversation.open(this.clock.now());
    await this.conversations.save(created);
    return created;
  }

  private async projectConversationOf(projectId: EntityId): Promise<Conversation> {
    const existing: Nullable<Conversation> = (await this.conversations.findByProject(projectId)).toNullable();
    if (existing !== null) {
      return existing;
    }
    const created: Conversation = ProjectConversation.forProject(projectId, this.clock.now());
    await this.conversations.save(created);
    return created;
  }

  private async view(
    conversation: Conversation,
    userId: EntityId,
    title: string,
    counterpartId: Nullable<string>,
  ): Promise<ConversationView> {
    const readAt: Nullable<Date> = ReadMarker.readAtOf(
      (await this.markers.find(conversation.getId(), userId)).toNullable(),
    );
    const unread: number =
      conversation.getLastMessageAt() === null
        ? 0
        : await this.messages.countAfter(conversation.getId(), readAt, userId);
    return new ConversationView(conversation, title, counterpartId, unread);
  }

  private async present(messages: ReadonlyArray<Message>): Promise<ChatMessageResponse[]> {
    const senders: User[] = await this.directory.findMany(
      messages.map((m: Message): EntityId => m.getSenderId()),
    );
    return messages.map((message: Message): ChatMessageResponse => {
      const sender: Nullable<User> =
        senders.find((u: User): boolean => u.getId().equals(message.getSenderId())) ?? null;
      return ChatService.toResponse(message, sender === null ? 'Usuario eliminado' : sender.getDisplayName());
    });
  }

  private static fallback(message: Message): ChatMessageResponse {
    return ChatService.toResponse(message, 'Usuario');
  }

  private static toResponse(message: Message, senderName: string): ChatMessageResponse {
    const s = message.toSnapshot();
    return {
      id: s.id,
      conversationId: s.conversationId,
      senderId: s.senderId,
      senderName,
      text: s.text,
      sentAt: s.sentAt.toISOString(),
      editedAt: s.editedAt === null ? null : s.editedAt.toISOString(),
      deleted: s.deletedAt !== null,
    };
  }
}
