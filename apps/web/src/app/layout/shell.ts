import { ChangeDetectionStrategy, Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '@asisteglt/web-core';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Drawer } from 'primeng/drawer';
import { PanelMenu } from 'primeng/panelmenu';
import { Toast } from 'primeng/toast';
import { Toolbar } from 'primeng/toolbar';
import { Tooltip } from 'primeng/tooltip';
import { Navigation } from './navigation';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Toolbar, Button, Drawer, PanelMenu, Toast, ConfirmDialog, Tooltip],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly menu: MenuItem[] = Navigation.items();
  protected readonly navigationOpen: WritableSignal<boolean> = signal<boolean>(false);

  private readonly theme: ThemeService = inject(ThemeService);

  protected readonly isDark: Signal<boolean> = this.theme.isDark;

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected openNavigation(): void {
    this.navigationOpen.set(true);
  }

  protected onNavigationVisibleChange(visible: boolean): void {
    this.navigationOpen.set(visible);
  }
}
