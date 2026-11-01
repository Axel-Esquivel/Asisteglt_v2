import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Nullable } from '@asisteglt/shared-kernel';
import { AuthSession, CurrentUser, ThemeService } from '@asisteglt/web-core';
import { MenuItem } from 'primeng/api';
import { Avatar } from 'primeng/avatar';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Drawer } from 'primeng/drawer';
import { Menu } from 'primeng/menu';
import { PanelMenu } from 'primeng/panelmenu';
import { Toolbar } from 'primeng/toolbar';
import { Tooltip } from 'primeng/tooltip';
import { filter, map } from 'rxjs';
import { FloatingChat } from '../../features/chat/floating/floating-chat';
import { Navigation } from './navigation';

/** Contexto de la aplicación autenticada: barra, menú lateral y su propio `router-outlet`. */
@Component({
  selector: 'app-app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Toolbar, Button, Drawer, PanelMenu, ConfirmDialog, Tooltip, Avatar, Menu, FloatingChat],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout {
  private readonly theme: ThemeService = inject(ThemeService);
  private readonly session: AuthSession = inject(AuthSession);
  private readonly router: Router = inject(Router);
  private readonly url: Signal<string> = toSignal(
    this.router.events.pipe(
      filter((event: unknown): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd): string => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * El chat flotante acompaña a toda la aplicación autenticada salvo donde ya hay un chat a
   * pantalla completa: el contexto de chat y la pestaña de chat de cada proyecto.
   */
  protected readonly floatingChatVisible: Signal<boolean> = computed(
    (): boolean => !/^\/app\/(chat|projects\/[^/?#]+\/chat)(?=[/?#]|$)/.test(this.url()),
  );

  protected readonly menu: MenuItem[] = Navigation.items();
  protected readonly navigationOpen: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly isDark: Signal<boolean> = this.theme.isDark;
  protected readonly user: Signal<Nullable<CurrentUser>> = this.session.currentUser;
  protected readonly userMenu: MenuItem[] = [
    { label: 'Mi cuenta', icon: 'pi pi-user', routerLink: '/app/account' },
    { separator: true },
    {
      label: 'Cerrar sesión',
      icon: 'pi pi-sign-out',
      command: (): void => {
        this.session.logout().catch((): void => {
          // El cierre local ocurre aunque falle la llamada.
        });
      },
    },
  ];

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected openNavigation(): void {
    this.navigationOpen.set(true);
  }

  protected onNavigationVisibleChange(visible: boolean): void {
    this.navigationOpen.set(visible);
  }

  protected closeNavigation(): void {
    this.navigationOpen.set(false);
  }
}
