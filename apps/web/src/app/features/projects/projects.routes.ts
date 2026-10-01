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
        path: 'org',
        title: 'Estructura · AsisteGLT',
        loadComponent: () => import('../reports/org/org-structure.page').then((m) => m.OrgStructurePage),
      },
      {
        path: 'catalog',
        title: 'Encabezados · AsisteGLT',
        loadComponent: () => import('../reports/catalog/catalog.page').then((m) => m.CatalogPage),
      },
      {
        path: 'profiles',
        title: 'Preconfiguraciones · AsisteGLT',
        loadComponent: () => import('../reports/profiles/profiles.page').then((m) => m.ProfilesPage),
      },
      {
        path: 'profiles/new',
        title: 'Nueva preconfiguración · AsisteGLT',
        data: { profileId: 'new' },
        loadComponent: () => import('../reports/wizard/profile-wizard.page').then((m) => m.ProfileWizardPage),
      },
      {
        path: 'profiles/:profileId',
        title: 'Preconfiguración · AsisteGLT',
        loadComponent: () => import('../reports/wizard/profile-wizard.page').then((m) => m.ProfileWizardPage),
      },
      {
        path: 'imports',
        title: 'Cargar datos · AsisteGLT',
        loadComponent: () => import('../reports/imports/imports.page').then((m) => m.ImportsPage),
      },
      {
        path: 'data',
        title: 'Datos · AsisteGLT',
        loadComponent: () => import('../reports/data/data.page').then((m) => m.DataPage),
      },
      {
        path: 'operations',
        title: 'Operaciones · AsisteGLT',
        loadComponent: () => import('../reports/operations/operations.page').then((m) => m.OperationsPage),
      },
      {
        path: 'classifications',
        title: 'Clasificaciones · AsisteGLT',
        loadComponent: () =>
          import('../reports/classifications/classifications.page').then((m) => m.ClassificationsPage),
      },
      {
        path: 'reports',
        title: 'Informes · AsisteGLT',
        loadComponent: () => import('../reports/report-viewer/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'inventory',
        title: 'Tomas · AsisteGLT',
        loadComponent: () => import('../inventory/list/counts.page').then((m) => m.CountsPage),
      },
      {
        path: 'inventory/:countId',
        title: 'Toma · AsisteGLT',
        loadComponent: () => import('../inventory/count/count.page').then((m) => m.CountPage),
      },
      {
        path: 'chat',
        title: 'Chat del proyecto · AsisteGLT',
        loadComponent: () => import('./chat/project-chat.page').then((m) => m.ProjectChatPage),
      },
      {
        path: 'sharing',
        title: 'Compartir · AsisteGLT',
        loadComponent: () => import('./sharing/project-sharing.page').then((m) => m.ProjectSharingPage),
      },
    ],
  },
];
