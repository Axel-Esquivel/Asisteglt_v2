import { DestroyRef, Injectable, Signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeEvent } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { AuthSession, BaseStore, CurrentUser, RealtimeClient } from '@asisteglt/web-core';
import { ChatApiClient } from './chat.api-client';
import { ChatMessage, ConversationSummary, PresenceChange } from './chat.model';

interface ChatState {
  readonly conversations: ReadonlyArray<ConversationSummary>;
  readonly online: ReadonlySet<string>;
  readonly activeId: Nullable<string>;
}

/** Lista de conversaciones, no leídos y presencia; se actualiza con eventos en tiempo real. */
@Injectable()
export class ChatStore extends BaseStore<ChatState> {
  public readonly conversations: Signal<ReadonlyArray<ConversationSummary>> = this.select(
    (s: ChatState): ReadonlyArray<ConversationSummary> => s.conversations,
  );
  public readonly activeId: Signal<Nullable<string>> = this.select(
    (s: ChatState): Nullable<string> => s.activeId,
  );
  public readonly totalUnread: Signal<number> = computed((): number =>
    this.conversations().reduce((sum: number, c: ConversationSummary): number => sum + c.unread, 0),
  );

  private readonly api: ChatApiClient = inject(ChatApiClient);
  private readonly realtime: RealtimeClient = inject(RealtimeClient);
  private readonly session: AuthSession = inject(AuthSession);
  private readonly online: Signal<ReadonlySet<string>> = this.select(
    (s: ChatState): ReadonlySet<string> => s.online,
  );

  public constructor() {
    super({ conversations: [], online: new Set<string>(), activeId: null });
    const destroyRef: DestroyRef = inject(DestroyRef);
    this.realtime
      .events(RealtimeEvent.CHAT_MESSAGE, ChatMessage.decoder())
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((message: ChatMessage): void => this.onMessage(message));
    this.realtime
      .events(RealtimeEvent.PRESENCE_CHANGED, PresenceChange.decoder())
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((change: PresenceChange): void => this.onPresence(change));
  }

  public isOnline(userId: Nullable<string>): boolean {
    return userId !== null && this.online().has(userId);
  }

  public async load(): Promise<Result<ConversationSummary[]>> {
    const [list, online] = await Promise.all([this.api.list(), this.api.online()]);
    const users: string[] = online.match(
      (ids: string[]): string[] => ids,
      (): string[] => [],
    );
    list.match(
      (items: ConversationSummary[]): void =>
        this.update((current: ChatState): ChatState => ({
          ...current,
          conversations: [...items].sort(ConversationSummary.compare),
          online: new Set<string>(users),
        })),
      (): void => {
        // El componente informa el error.
      },
    );
    return list;
  }

  public upsert(conversation: ConversationSummary): void {
    this.update((current: ChatState): ChatState => {
      const others: ConversationSummary[] = current.conversations.filter(
        (c: ConversationSummary): boolean => c.id !== conversation.id,
      );
      return { ...current, conversations: [...others, conversation].sort(ConversationSummary.compare) };
    });
  }

  public activate(id: Nullable<string>): void {
    this.update((current: ChatState): ChatState => ({
      ...current,
      activeId: id,
      conversations: current.conversations.map((c: ConversationSummary): ConversationSummary =>
        c.id === id ? c.withUnread(0) : c,
      ),
    }));
  }

  private onMessage(message: ChatMessage): void {
    const me: Nullable<CurrentUser> = this.session.currentUser();
    const mine: boolean = me !== null && me.id === message.senderId;
    const known: boolean = this.snapshot().conversations.some(
      (c: ConversationSummary): boolean => c.id === message.conversationId,
    );
    if (!known) {
      this.load().catch((): void => {
        // Se reintenta con el siguiente evento.
      });
      return;
    }
    this.update((current: ChatState): ChatState => ({
      ...current,
      conversations: current.conversations
        .map((c: ConversationSummary): ConversationSummary => {
          if (c.id !== message.conversationId) {
            return c;
          }
          const unread: number = mine || current.activeId === c.id ? 0 : c.unread + 1;
          return c.withActivity(message.sentAt, unread);
        })
        .sort(ConversationSummary.compare),
    }));
  }

  private onPresence(change: PresenceChange): void {
    this.update((current: ChatState): ChatState => {
      const online: Set<string> = new Set<string>(current.online);
      if (change.online) {
        online.add(change.userId);
      } else {
        online.delete(change.userId);
      }
      return { ...current, online };
    });
  }
}
