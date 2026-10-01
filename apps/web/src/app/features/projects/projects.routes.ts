import { Route } from '@angular/router';

/** Rutas del contexto de proyectos; cada proyecto abre su propio layout con `router-outlet`. */
export const PROJECTS_ROUTES: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Proyectos · AsisteGLT',
    loadComponent: () => import('./list/projects-list.page').then((m) => m.ProjectsListPage),
  },
  {
    path: ':projectId',
    loadComponent: () => import('./layout/project-layout').then((m) => m.ProjectLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Proyecto · AsisteGLT',
        loadComponent: () => import('./overview/project-overview.page').then((m) => m.ProjectOverviewPage),
      },
      {
        path: 'members',
        title: 'Miembros · AsisteGLT',
        loadComponent: () => import('./members/project-members.page').then((m) => m.ProjectMembersPage),
      },
      {
        path: 'sharing',
        title: 'Compartir · AsisteGLT',
        loadComponent: () => import('./sharing/project-sharing.page').then((m) => m.ProjectSharingPage),
      },
    ],
  },
];
