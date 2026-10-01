import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ThemeService } from '@asisteglt/web-core';
import { Shell } from './layout/shell';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Shell],
  template: '<app-shell />',
})
export class App implements OnInit {
  private readonly theme: ThemeService = inject(ThemeService);

  public ngOnInit(): void {
    this.theme.initialize();
  }
}
