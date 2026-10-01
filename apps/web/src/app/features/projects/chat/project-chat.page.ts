import { ChangeDetectionStrategy, Component, OnInit, WritableSignal, inject, signal } from '@angular/core';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Message } from 'primeng/message';
import { ConversationView } from '../../chat/conversation/conversation-view';
import { ChatApiClient } from '../../chat/data/chat.api-client';
import { ConversationSummary } from '../../chat/data/chat.model';
import { ProjectContext } from '../data/project-context';

/** Chat de los miembros del proyecto (pestaña del contexto de proyecto). */
@Component({
  selector: 'app-project-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConversationView, Message],
  template: `
    @if (conversation(); as current) {
      <app-conversation-view [conversationId]="current.id" [title]="'Chat de ' + current.title" />
    } @else if (errorMessage(); as message) {
      <p-message severity="error">{{ message }}</p-message>
    }
  `,
  styles: `
    :host {
      display: block;
      height: calc(100dvh - 16rem);
      min-height: 22rem;
    }
  `,
})
export class ProjectChatPage implements OnInit {
  protected readonly conversation: WritableSignal<Nullable<ConversationSummary>> =
    signal<Nullable<ConversationSummary>>(null);
  protected readonly errorMessage: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);

  private readonly api: ChatApiClient = inject(ChatApiClient);
  private readonly context: ProjectContext = inject(ProjectContext);

  public ngOnInit(): void {
    this.api
      .forProject(this.context.id())
      .then((result: Result<ConversationSummary>): void =>
        result.match(
          (conversation: ConversationSummary): void => this.conversation.set(conversation),
          (error): void => this.errorMessage.set(error.message),
        ),
      )
      .catch((): void => {
        // Informado arriba.
      });
  }
}
