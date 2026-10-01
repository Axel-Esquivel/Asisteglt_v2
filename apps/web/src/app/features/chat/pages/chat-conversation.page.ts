import { ChangeDetectionStrategy, Component, InputSignal, Signal, computed, inject, input } from '@angular/core';
import { Nullable } from '@asisteglt/shared-kernel';
import { ConversationView } from '../conversation/conversation-view';
import { ConversationSummary } from '../data/chat.model';
import { ChatStore } from '../data/chat-store';

/** Conversación abierta en el contexto de chat (`/app/chat/:conversationId`). */
@Component({
  selector: 'app-chat-conversation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConversationView],
  template: `<app-conversation-view [conversationId]="conversationId()" [title]="title()" />`,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-height: 0;
    }
  `,
})
export class ChatConversationPage {
  public readonly conversationId: InputSignal<string> = input.required<string>();

  private readonly store: ChatStore = inject(ChatStore);

  protected readonly title: Signal<string> = computed((): string => {
    const id: string = this.conversationId();
    const match: Nullable<ConversationSummary> =
      this.store.conversations().find((c: ConversationSummary): boolean => c.id === id) ?? null;
    return match === null ? 'Conversación' : match.title;
  });
}
