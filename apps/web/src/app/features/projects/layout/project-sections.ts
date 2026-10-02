import { ProjectPermission } from '@asisteglt/shared-contracts';
import { ProjectSummary } from '../data/project.model';

export interface ProjectSection {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
}

/** Secciones (pestañas) visibles de un proyecto según su módulo y los permisos del usuario. */
export class ProjectSections {
  public static for(project: ProjectSummary): ProjectSection[] {
    const sections: ProjectSection[] = [{ path: '', label: 'Resumen', icon: 'pi pi-info-circle' }];
    const configure: boolean = project.can(ProjectPermission.DATA_CONFIGURE);
    if (configure || project.can(ProjectPermission.DATA_LOAD)) {
      sections.push({ path: 'org', label: 'Estructura', icon: 'pi pi-building' });
    }
    if (configure) {
      sections.push({ path: 'catalog', label: 'Encabezados', icon: 'pi pi-tags' });
      sections.push({ path: 'profiles', label: 'Preconfiguraciones', icon: 'pi pi-sliders-h' });
    }
    if (project.can(ProjectPermission.DATA_LOAD)) {
      sections.push({ path: 'imports', label: 'Cargar datos', icon: 'pi pi-upload' });
    }
    if (project.can(ProjectPermission.DATA_VIEW)) {
      sections.push({ path: 'data', label: 'Datos', icon: 'pi pi-table' });
    }
    if (configure) {
      sections.push({ path: 'collections', label: 'Colecciones', icon: 'pi pi-database' });
      sections.push({ path: 'operations', label: 'Operaciones', icon: 'pi pi-calculator' });
      sections.push({ path: 'classifications', label: 'Clasificaciones', icon: 'pi pi-sitemap' });
    }
    if (project.can(ProjectPermission.REPORTS_VIEW)) {
      sections.push({ path: 'reports', label: 'Informes', icon: 'pi pi-chart-bar' });
      sections.push({ path: 'templates', label: 'Plantillas', icon: 'pi pi-file' });
    }
    const inventory: boolean = [
      ProjectPermission.INVENTORY_CONFIGURE,
      ProjectPermission.INVENTORY_COUNT,
      ProjectPermission.INVENTORY_VIEW,
    ].some((p: ProjectPermission): boolean => project.can(p));
    if (!project.isReports() && inventory) {
      sections.push({ path: 'inventory', label: 'Tomas', icon: 'pi pi-box' });
    }
    sections.push({ path: 'members', label: 'Miembros', icon: 'pi pi-users' });
    sections.push({ path: 'chat', label: 'Chat', icon: 'pi pi-comments' });
    if (project.can(ProjectPermission.MEMBERS_MANAGE)) {
      sections.push({ path: 'sharing', label: 'Compartir', icon: 'pi pi-share-alt' });
    }
    return sections;
  }

  /** Primer segmento después de `/app/projects/:id` ('' para el resumen). */
  public static active(url: string, projectId: string): string {
    const prefix: string = `/app/projects/${projectId}`;
    const rest: string = url.startsWith(prefix) ? url.slice(prefix.length) : '';
    const segment: string = rest.split(/[/?#]/).filter((part: string): boolean => part.length > 0)[0] ?? '';
    return segment;
  }
}
