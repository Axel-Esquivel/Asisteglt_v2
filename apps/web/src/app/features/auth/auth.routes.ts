import { Route } from '@angular/router';

export const AUTH_ROUTES: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'Iniciar sesión · AsisteGLT',
    loadComponent: () => import('./login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Crear cuenta · AsisteGLT',
    loadComponent: () => import('./register.page').then((m) => m.RegisterPage),
  },
];
