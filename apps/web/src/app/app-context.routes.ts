import { Route } from '@angular/router';

/** Rutas hijas del contexto de aplicación (todas diferidas). */
export const APP_CONTEXT_ROUTES: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Inicio · AsisteGLT',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'account',
    title: 'Mi cuenta · AsisteGLT',
    loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage),
  },
  {
    path: 'projects',
    loadChildren: () => import('./features/projects/projects.routes').then((m) => m.PROJECTS_ROUTES),
  },
  {
    path: 'chat',
    loadChildren: () => import('./features/chat/chat.routes').then((m) => m.CHAT_ROUTES),
  },
  {
    path: 'join/:token',
    title: 'Unirse a un proyecto · AsisteGLT',
    loadComponent: () => import('./features/projects/join/join-project.page').then((m) => m.JoinProjectPage),
  },
];
