import { Injectable, WritableSignal, signal } from '@angular/core';
import { Nullable } from '@asisteglt/shared-kernel';

/** Access token solo en memoria (nunca en localStorage). */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly token: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);

  public current(): Nullable<string> {
    return this.token();
  }

  public set(token: string): void {
    this.token.set(token);
  }

  public clear(): void {
    this.token.set(null);
  }
}
