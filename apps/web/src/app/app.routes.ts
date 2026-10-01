import { Route } from '@angular/router';
import { authGuard, guestGuard } from '@asisteglt/web-core';

/**
 * Contextos de navegación (cada uno con su layout y `router-outlet`, cargados de forma diferida):
 * - /auth → acceso (login, registro)
 * - /app  → aplicación autenticada (inicio, proyectos, chat, cuenta…)
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  {
    path: 'auth',
    canMatch: [guestGuard],
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'app',
    canMatch: [authGuard],
    loadComponent: () => import('./layouts/app-layout/app-layout').then((m) => m.AppLayout),
    loadChildren: () => import('./app-context.routes').then((m) => m.APP_CONTEXT_ROUTES),
  },
  {
    path: '**',
    title: 'No encontrado · AsisteGLT',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
