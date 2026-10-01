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
];
