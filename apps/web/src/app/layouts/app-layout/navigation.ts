import { MenuItem } from 'primeng/api';
import { FloatingChatControl } from '../../features/chat/floating/floating-chat-control';

/** Menú principal del contexto de aplicación. */
export class Navigation {
  /** El chat no es una pantalla: abre la ventana flotante sobre la pantalla actual. */
  public static items(chat: FloatingChatControl): MenuItem[] {
    return [
      { label: 'Inicio', icon: 'pi pi-home', routerLink: '/app' },
      { label: 'Proyectos', icon: 'pi pi-folder', routerLink: '/app/projects' },
      { label: 'Chat', icon: 'pi pi-comments', command: (): void => chat.show() },
      { label: 'Mi cuenta', icon: 'pi pi-user', routerLink: '/app/account' },
    ];
  }
}
