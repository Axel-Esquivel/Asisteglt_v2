import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '@asisteglt/web-core';

/** Contexto de impresión: sin menú ni barra de la aplicación y siempre en modo claro. */
@Component({
  selector: 'app-print-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class PrintLayout implements OnInit, OnDestroy {
  private readonly theme: ThemeService = inject(ThemeService);

  public ngOnInit(): void {
    this.theme.suspendDarkMode();
  }

  public ngOnDestroy(): void {
    this.theme.restoreDarkMode();
  }
}
