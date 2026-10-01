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
    sections.push({ path: 'members', label: 'Miembros', icon: 'pi pi-users' });
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
