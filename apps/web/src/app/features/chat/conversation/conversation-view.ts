import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InputSignal,
  Signal,
  WritableSignal,
  afterRenderEffect,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RealtimeEvent } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { AuthSession, CurrentUser, Notifier, RealtimeClient } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';
import { ChatApiClient } from '../data/chat.api-client';
import { ChatMessage } from '../data/chat.model';
import { ChatStore } from '../data/chat-store';

/**
 * Mensajes de una conversación con su caja de redacción. Se reutiliza en el chat general y en la
 * pestaña de chat de cada proyecto.
 */
@Component({
  selector: 'app-conversation-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, Button, Message, Textarea],
  templateUrl: './conversation-view.html',
  styleUrl: './conversation-view.scss',
})
export class ConversationView {
  public readonly conversationId: InputSignal<string> = input.required<string>();
  public readonly title: InputSignal<string> = input.required<string>();

  protected readonly messages: WritableSignal<ChatMessage[]> = signal<ChatMessage[]>([]);
  protected readonly draft: WritableSignal<string> = signal<string>('');
  protected readonly editing: WritableSignal<Nullable<ChatMessage>> = signal<Nullable<ChatMessage>>(null);
  protected readonly sending: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly hasMore: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly loadFailed: WritableSignal<boolean> = signal<boolean>(false);

  private readonly scroller: Signal<ElementRef<HTMLElement>> =
    viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly api: ChatApiClient = inject(ChatApiClient);
  private readonly session: AuthSession = inject(AuthSession);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly store: Nullable<ChatStore> = inject(ChatStore, { optional: true });
  private stickToBottom: boolean = true;

  public constructor() {
    const realtime: RealtimeClient = inject(RealtimeClient);
    const destroyRef: DestroyRef = inject(DestroyRef);
    realtime
      .events(RealtimeEvent.CHAT_MESSAGE, ChatMessage.decoder())
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((message: ChatMessage): void => this.receive(message, false));
    realtime
      .events(RealtimeEvent.CHAT_MESSAGE_UPDATED, ChatMessage.decoder())
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((message: ChatMessage): void => this.receive(message, true));

    effect((): void => {
      const id: string = this.conversationId();
      untracked((): void => {
        this.open(id).catch((): void => {
          // Informado en open.
        });
      });
    });
    afterRenderEffect((): void => {
      this.messages();
      if (this.stickToBottom) {
        const element: HTMLElement = this.scroller().nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    });
    destroyRef.onDestroy((): void => {
      if (this.store !== null) {
        this.store.activate(null);
      }
    });
  }

  protected isMine(message: ChatMessage): boolean {
    const me: Nullable<CurrentUser> = this.session.currentUser();
    return me !== null && me.id === message.senderId;
  }

  protected onScroll(): void {
    const element: HTMLElement = this.scroller().nativeElement;
    this.stickToBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit().catch((): void => {
        // Informado en submit.
      });
    }
  }

  protected startEdit(message: ChatMessage): void {
    this.editing.set(message);
    this.draft.set(message.text);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.draft.set('');
  }

  protected async submit(): Promise<void> {
    const text: string = this.draft().trim();
    if (text.length === 0 || this.sending()) {
      return;
    }
    this.sending.set(true);
    const target: Nullable<ChatMessage> = this.editing();
    const result: Result<ChatMessage> =
      target === null
        ? await this.api.send(this.conversationId(), text)
        : await this.api.edit(target.id, text);
    this.sending.set(false);
    result.match(
      (message: ChatMessage): void => {
        this.stickToBottom = true;
        this.receive(message, target !== null);
        this.cancelEdit();
      },
      (error): void => this.notifier.error(error),
    );
  }

  protected async remove(message: ChatMessage): Promise<void> {
    const result: Result<ChatMessage> = await this.api.remove(message.id);
    result.match(
      (updated: ChatMessage): void => this.receive(updated, true),
      (error): void => this.notifier.error(error),
    );
  }

  protected async loadOlder(): Promise<void> {
    const first: Nullable<ChatMessage> = this.messages()[0] ?? null;
    if (first === null) {
      return;
    }
    this.stickToBottom = false;
    const result: Result<ChatMessage[]> = await this.api.history(this.conversationId(), first.sentAt);
    result.match(
      (older: ChatMessage[]): void => {
        this.hasMore.set(older.length >= 50);
        this.messages.update((current: ChatMessage[]): ChatMessage[] => [...older, ...current]);
      },
      (error): void => this.notifier.error(error),
    );
  }

  private async open(conversationId: string): Promise<void> {
    this.messages.set([]);
    this.cancelEdit();
    this.stickToBottom = true;
    if (this.store !== null) {
      this.store.activate(conversationId);
    }
    const result: Result<ChatMessage[]> = await this.api.history(conversationId, null);
    result.match(
      (items: ChatMessage[]): void => {
        this.loadFailed.set(false);
        this.hasMore.set(items.length >= 50);
        this.messages.set(items);
      },
      (): void => this.loadFailed.set(true),
    );
    await this.api.markRead(conversationId);
  }

  private receive(message: ChatMessage, updated: boolean): void {
    if (message.conversationId !== this.conversationId()) {
      return;
    }
    this.messages.update((current: ChatMessage[]): ChatMessage[] => {
      const exists: boolean = current.some((m: ChatMessage): boolean => m.id === message.id);
      if (exists) {
        return current.map((m: ChatMessage): ChatMessage => (m.id === message.id ? message : m));
      }
      return updated ? current : [...current, message];
    });
    if (!updated && !this.isMine(message)) {
      this.api.markRead(message.conversationId).catch((): void => {
        // Se marcará al volver a abrir la conversación.
      });
    }
  }
}
