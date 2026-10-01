import { MenuItem } from 'primeng/api';

/** Menú principal. Las secciones de fases posteriores aparecen deshabilitadas hasta implementarse. */
export class Navigation {
  public static items(): MenuItem[] {
    return [
      { label: 'Inicio', icon: 'pi pi-home', routerLink: '/' },
      {
        label: 'Reportes',
        icon: 'pi pi-chart-bar',
        items: [{ label: 'Proyectos de reportes', icon: 'pi pi-folder', disabled: true }],
      },
      {
        label: 'Inventarios',
        icon: 'pi pi-box',
        items: [{ label: 'Tomas de inventario', icon: 'pi pi-list-check', disabled: true }],
      },
      { label: 'Chat', icon: 'pi pi-comments', disabled: true },
    ];
  }
}
