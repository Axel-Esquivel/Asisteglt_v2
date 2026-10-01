/** Contratos del chat (REST y eventos en tiempo real). */
export enum ConversationType {
  GLOBAL = 'GLOBAL',
  DIRECT = 'DIRECT',
  PROJECT = 'PROJECT',
}

export interface ConversationResponse {
  readonly id: string;
  readonly type: ConversationType;
  readonly title: string;
  readonly projectId: string | null;
  readonly counterpartId: string | null;
  readonly lastMessageAt: string | null;
  readonly unread: number;
}

export interface ChatMessageResponse {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly text: string;
  readonly sentAt: string;
  readonly editedAt: string | null;
  readonly deleted: boolean;
}

export interface OpenDirectRequest {
  readonly userId: string;
}

export interface PostMessageRequest {
  readonly text: string;
}

export interface PresenceResponse {
  readonly online: ReadonlyArray<string>;
}

/** Nombres de eventos Socket.IO emitidos por el servidor. */
export enum RealtimeEvent {
  CHAT_MESSAGE = 'chat:message',
  CHAT_MESSAGE_UPDATED = 'chat:message-updated',
  PRESENCE_CHANGED = 'presence:changed',
}

export interface PresenceChangedEvent {
  readonly userId: string;
  readonly online: boolean;
}

export enum ChatErrorCode {
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  NOT_MESSAGE_AUTHOR = 'NOT_MESSAGE_AUTHOR',
  INVALID_DIRECT_TARGET = 'INVALID_DIRECT_TARGET',
}
