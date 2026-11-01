import { MenuItem } from 'primeng/api';

/** Menú principal del contexto de aplicación. */
export class Navigation {
  /** El chat no figura aquí: se abre con la burbuja flotante (ver `FloatingChat`). */
  public static items(): MenuItem[] {
    return [
      { label: 'Inicio', icon: 'pi pi-home', routerLink: '/app' },
      { label: 'Proyectos', icon: 'pi pi-folder', routerLink: '/app/projects' },
      { label: 'Mi cuenta', icon: 'pi pi-user', routerLink: '/app/account' },
    ];
  }
}
