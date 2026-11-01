import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { AutoComplete, AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { Badge } from 'primeng/badge';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { ConversationView } from '../conversation/conversation-view';
import { ChatApiClient } from '../data/chat.api-client';
import { ConversationSummary, UserMatch } from '../data/chat.model';
import { ChatStore } from '../data/chat-store';

/** Esquina superior izquierda de la ventana tras arrastrarla, en píxeles del viewport. */
class WindowOffset {
  public constructor(
    public readonly left: number,
    public readonly top: number,
  ) {}

  public static of(element: HTMLElement): WindowOffset {
    const rect: DOMRect = element.getBoundingClientRect();
    return new WindowOffset(rect.left, rect.top);
  }

  /** Coloca el elemento en esta posición sin dejar que se salga del viewport (p. ej. tras redimensionar). */
  public applyTo(element: HTMLElement, viewport: Window): void {
    const rect: DOMRect = element.getBoundingClientRect();
    const left: number = Math.min(Math.max(this.left, 0), Math.max(viewport.innerWidth - rect.width, 0));
    const top: number = Math.min(Math.max(this.top, 0), Math.max(viewport.innerHeight - rect.height, 0));
    element.style.position = 'fixed';
    element.style.margin = '0';
    element.style.left = `${String(left)}px`;
    element.style.top = `${String(top)}px`;
  }
}

/**
 * Chat como ventana flotante, disponible en toda la aplicación autenticada. Minimizado se muestra
 * como una burbuja con los mensajes sin leer; abierto, como una ventana no modal que se arrastra
 * por su cabecera y alterna entre la lista de conversaciones y la conversación elegida.
 */
@Component({
  selector: 'app-floating-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AutoComplete, Badge, Button, Dialog, ConversationView],
  providers: [ChatStore],
  templateUrl: './floating-chat.html',
  styleUrl: './floating-chat.scss',
})
export class FloatingChat implements OnInit {
  protected readonly store: ChatStore = inject(ChatStore);
  protected readonly open: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly searching: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly suggestions: WritableSignal<UserMatch[]> = signal<UserMatch[]>([]);
  protected readonly selectedUser: WritableSignal<Nullable<UserMatch>> = signal<Nullable<UserMatch>>(null);
  protected readonly activeId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);

  protected readonly active: Signal<Nullable<ConversationSummary>> = computed(
    (): Nullable<ConversationSummary> => {
      const id: Nullable<string> = this.activeId();
      return this.store.conversations().find((c: ConversationSummary): boolean => c.id === id) ?? null;
    },
  );
  protected readonly unreadLabel: Signal<string> = computed((): string => {
    const total: number = this.store.totalUnread();
    return total > 99 ? '99+' : String(total);
  });

  private readonly api: ChatApiClient = inject(ChatApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly router: Router = inject(Router);
  private readonly dialog: Signal<Dialog> = viewChild.required<Dialog>(Dialog);
  /** Posición elegida por la persona; se conserva al minimizar y restaurar. */
  private offset: Nullable<WindowOffset> = null;

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

  protected restore(): void {
    this.open.set(true);
  }

  protected onVisibleChange(visible: boolean): void {
    this.open.set(visible);
  }

  protected onDragEnd(): void {
    const container: Nullable<HTMLElement> = this.dialog().container() ?? null;
    if (container !== null) {
      this.offset = WindowOffset.of(container);
    }
  }

  protected onShow(): void {
    const container: Nullable<HTMLElement> = this.dialog().container() ?? null;
    const view: Nullable<Window> = container === null ? null : container.ownerDocument.defaultView;
    if (this.offset !== null && container !== null && view !== null) {
      this.offset.applyTo(container, view);
    }
  }

  protected select(conversation: ConversationSummary): void {
    this.searching.set(false);
    this.activeId.set(conversation.id);
  }

  protected back(): void {
    this.activeId.set(null);
  }

  protected toggleSearch(): void {
    this.selectedUser.set(null);
    this.suggestions.set([]);
    this.searching.update((current: boolean): boolean => !current);
  }

  protected async expand(): Promise<void> {
    const id: Nullable<string> = this.activeId();
    this.open.set(false);
    await this.router.navigate(id === null ? ['/app/chat'] : ['/app/chat', id]);
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
    result.match(
      (conversation: ConversationSummary): void => {
        this.store.upsert(conversation);
        this.select(conversation);
      },
      (error): void => this.notifier.error(error),
    );
  }
}
