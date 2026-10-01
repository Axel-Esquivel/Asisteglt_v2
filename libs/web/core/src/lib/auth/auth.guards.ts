import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSession } from './auth-session';

/** Contexto de la aplicación: requiere sesión; si no, lleva al login. */
export const authGuard: CanMatchFn = (): boolean | UrlTree => {
  const session: AuthSession = inject(AuthSession);
  return session.isAuthenticated() ? true : inject(Router).parseUrl('/auth/login');
};

/** Contexto de acceso: si ya hay sesión, lleva a la aplicación. */
export const guestGuard: CanMatchFn = (): boolean | UrlTree => {
  const session: AuthSession = inject(AuthSession);
  return session.isAuthenticated() ? inject(Router).parseUrl('/app') : true;
};
