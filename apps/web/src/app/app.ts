import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '@asisteglt/web-core';
import { Toast } from 'primeng/toast';

/** Raíz: solo el `router-outlet` de nivel superior; cada contexto aporta su layout. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Toast],
  template: '<router-outlet /><p-toast position="top-right" />',
})
export class App implements OnInit {
  private readonly theme: ThemeService = inject(ThemeService);

  public ngOnInit(): void {
    this.theme.initialize();
  }
}
