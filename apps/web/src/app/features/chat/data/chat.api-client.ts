import { Injectable } from '@angular/core';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { ApiClient, ArrayDecoder, EmptyDecoder, FieldDecoder, FieldReader } from '@asisteglt/web-core';
import { ChatMessage, ConversationSummary, UserMatch } from './chat.model';

@Injectable({ providedIn: 'root' })
export class ChatApiClient extends ApiClient {
  private readonly conversation: FieldDecoder<ConversationSummary> = ConversationSummary.decoder();
  private readonly conversations: ArrayDecoder<ConversationSummary> = new ArrayDecoder<ConversationSummary>(
    ConversationSummary.decoder(),
  );
  private readonly message: FieldDecoder<ChatMessage> = ChatMessage.decoder();
  private readonly messages: ArrayDecoder<ChatMessage> = new ArrayDecoder<ChatMessage>(ChatMessage.decoder());
  private readonly users: ArrayDecoder<UserMatch> = new ArrayDecoder<UserMatch>(UserMatch.decoder());
  private readonly presence: FieldDecoder<string[]> = new FieldDecoder<string[]>((f: FieldReader): string[] =>
    f.stringList('online'),
  );
  private readonly empty: EmptyDecoder = new EmptyDecoder();

  public list(): Promise<Result<ConversationSummary[]>> {
    return this.get('chat/conversations', this.conversations);
  }

  public openDirect(userId: string): Promise<Result<ConversationSummary>> {
    return this.post('chat/direct', { userId }, this.conversation);
  }

  public forProject(projectId: string): Promise<Result<ConversationSummary>> {
    return this.get(`chat/projects/${encodeURIComponent(projectId)}`, this.conversation);
  }

  public history(conversationId: string, before: Nullable<Date>): Promise<Result<ChatMessage[]>> {
    const query: string = before === null ? '' : `?before=${encodeURIComponent(before.toISOString())}`;
    return this.get(`chat/conversations/${encodeURIComponent(conversationId)}/messages${query}`, this.messages);
  }

  public send(conversationId: string, text: string): Promise<Result<ChatMessage>> {
    return this.post(`chat/conversations/${encodeURIComponent(conversationId)}/messages`, { text }, this.message);
  }

  public edit(messageId: string, text: string): Promise<Result<ChatMessage>> {
    return this.patch(`chat/messages/${encodeURIComponent(messageId)}`, { text }, this.message);
  }

  public remove(messageId: string): Promise<Result<ChatMessage>> {
    return this.delete(`chat/messages/${encodeURIComponent(messageId)}`, this.message);
  }

  public markRead(conversationId: string): Promise<Result<true>> {
    return this.post(`chat/conversations/${encodeURIComponent(conversationId)}/read`, null, this.empty);
  }

  public online(): Promise<Result<string[]>> {
    return this.get('chat/presence', this.presence);
  }

  public searchUsers(text: string): Promise<Result<UserMatch[]>> {
    return this.get(`users/search?q=${encodeURIComponent(text)}`, this.users);
  }
}
