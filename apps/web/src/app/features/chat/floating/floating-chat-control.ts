import { Injectable, Signal, WritableSignal, signal } from '@angular/core';
import { Nullable } from '@asisteglt/shared-kernel';

/**
 * Abre y minimiza el chat flotante desde cualquier parte de la aplicación (menú, inicio, enlaces
 * antiguos a /app/chat) sin navegar: la ventana se superpone a la pantalla actual.
 */
@Injectable({ providedIn: 'root' })
export class FloatingChatControl {
  private readonly openState: WritableSignal<boolean> = signal<boolean>(false);
  private readonly requestedState: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);

  public readonly isOpen: Signal<boolean> = this.openState.asReadonly();
  /** Conversación que se pidió abrir; la ventana la consume con `takeRequested()`. */
  public readonly requested: Signal<Nullable<string>> = this.requestedState.asReadonly();

  public show(): void {
    this.openState.set(true);
  }

  public showConversation(conversationId: string): void {
    this.requestedState.set(conversationId);
    this.openState.set(true);
  }

  public minimize(): void {
    this.openState.set(false);
  }

  public takeRequested(): Nullable<string> {
    const id: Nullable<string> = this.requestedState();
    this.requestedState.set(null);
    return id;
  }
}
