import { Signal, WritableSignal, computed, signal } from '@angular/core';

/**
 * Store basado en signals. El estado siempre se reemplaza completo (sin `Partial<T>`),
 * para no introducir propiedades opcionales (docs/08).
 */
export abstract class BaseStore<TState extends object> {
  private readonly state: WritableSignal<TState>;

  protected constructor(initialState: TState) {
    this.state = signal<TState>(initialState);
  }

  public select<R>(projector: (state: TState) => R): Signal<R> {
    return computed<R>((): R => projector(this.state()));
  }

  protected snapshot(): TState {
    return this.state();
  }

  protected update(updater: (current: TState) => TState): void {
    this.state.update(updater);
  }
}
