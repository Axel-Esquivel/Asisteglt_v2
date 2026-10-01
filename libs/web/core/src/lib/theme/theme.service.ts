import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { Nullable } from '@asisteglt/shared-kernel';
import { DARK_MODE_CLASS } from './asisteglt-preset';

/** Modo claro/oscuro; la preferencia se recuerda en este navegador si el almacenamiento está disponible. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private static readonly STORAGE_KEY: string = 'asisteglt.theme';

  private readonly document: Document = inject(DOCUMENT);
  private readonly dark: WritableSignal<boolean> = signal<boolean>(false);

  public readonly isDark: Signal<boolean> = this.dark.asReadonly();

  public initialize(): void {
    this.apply(this.readPreference() === 'dark');
  }

  public toggle(): void {
    this.apply(!this.dark());
    this.writePreference(this.dark() ? 'dark' : 'light');
  }

  private apply(dark: boolean): void {
    this.dark.set(dark);
    this.document.documentElement.classList.toggle(DARK_MODE_CLASS, dark);
  }

  private readPreference(): Nullable<string> {
    try {
      return this.document.defaultView === null ? null : this.document.defaultView.localStorage.getItem(ThemeService.STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private writePreference(value: string): void {
    try {
      if (this.document.defaultView !== null) {
        this.document.defaultView.localStorage.setItem(ThemeService.STORAGE_KEY, value);
      }
    } catch {
      // Sin almacenamiento (modo privado): la preferencia dura solo esta sesión.
    }
  }
}
