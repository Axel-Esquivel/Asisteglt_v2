import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { AutoComplete, AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { Badge } from 'primeng/badge';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { filter, map } from 'rxjs';
import { ChatApiClient } from '../data/chat.api-client';
import { ConversationSummary, UserMatch } from '../data/chat.model';
import { ChatStore } from '../data/chat-store';

/** Contexto de chat: lista de conversaciones a la izquierda y `router-outlet` con la conversación. */
@Component({
  selector: 'app-chat-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, AutoComplete, Badge, Button, Dialog],
  providers: [ChatStore],
  templateUrl: './chat-layout.html',
  styleUrl: './chat-layout.scss',
})
export class ChatLayout implements OnInit {
  protected readonly store: ChatStore = inject(ChatStore);
  protected readonly dialogOpen: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly suggestions: WritableSignal<UserMatch[]> = signal<UserMatch[]>([]);
  protected readonly selectedUser: WritableSignal<Nullable<UserMatch>> = signal<Nullable<UserMatch>>(null);

  private readonly api: ChatApiClient = inject(ChatApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly router: Router = inject(Router);
  private readonly url: Signal<string> = toSignal(
    this.router.events.pipe(
      filter((event: unknown): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd): string => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** En pantallas pequeñas solo se ve la lista o la conversación abierta. */
  protected readonly conversationOpen: Signal<boolean> = computed((): boolean =>
    /^\/app\/chat\/[^/?#]+/.test(this.url()),
  );

  public ngOnInit(): void {
    this.store
      .load()
      .then((result: Result<ConversationSummary[]>): void => {
        const error = result.errorOrNull();
        if (error !== null) {
          this.notifier.error(error);
        }
      })
      .catch((): void => {
        // Informado arriba.
      });
  }

  protected link(conversation: ConversationSummary): string[] {
    return ['/app/chat', conversation.id];
  }

  protected openDialog(): void {
    this.selectedUser.set(null);
    this.suggestions.set([]);
    this.dialogOpen.set(true);
  }

  protected async search(event: AutoCompleteCompleteEvent): Promise<void> {
    const result: Result<UserMatch[]> = await this.api.searchUsers(event.query);
    this.suggestions.set(
      result.match(
        (users: UserMatch[]): UserMatch[] => users,
        (): UserMatch[] => [],
      ),
    );
  }

  protected async startDirect(event: AutoCompleteSelectEvent): Promise<void> {
    const value: unknown = event.value;
    if (!(value instanceof UserMatch)) {
      return;
    }
    const result: Result<ConversationSummary> = await this.api.openDirect(value.id);
    await result.match(
      async (conversation: ConversationSummary): Promise<void> => {
        this.store.upsert(conversation);
        this.dialogOpen.set(false);
        await this.router.navigate(this.link(conversation));
      },
      (error): Promise<void> => {
        this.notifier.error(error);
        return Promise.resolve();
      },
    );
  }
}
