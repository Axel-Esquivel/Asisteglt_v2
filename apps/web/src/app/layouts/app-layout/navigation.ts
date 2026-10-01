import { MenuItem } from 'primeng/api';

/** Menú principal del contexto de aplicación. */
export class Navigation {
  public static items(): MenuItem[] {
    return [
      { label: 'Inicio', icon: 'pi pi-home', routerLink: '/app' },
      { label: 'Proyectos', icon: 'pi pi-folder', routerLink: '/app/projects' },
      { label: 'Chat', icon: 'pi pi-comments', routerLink: '/app/chat' },
      { label: 'Mi cuenta', icon: 'pi pi-user', routerLink: '/app/account' },
    ];
  }
}
