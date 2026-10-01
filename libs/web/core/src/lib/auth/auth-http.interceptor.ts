import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Nullable } from '@asisteglt/shared-kernel';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { ApiConfig } from '../http/api-config';
import { AuthSession } from './auth-session';
import { TokenStore } from './token-store';

/**
 * Agrega el access token a las peticiones a la API y, ante un 401, renueva la sesión una vez y
 * reintenta. Si no se puede renovar, envía al usuario a iniciar sesión.
 */
@Injectable({ providedIn: 'root' })
export class AuthHttpInterceptor {
  private static readonly AUTH_PATHS: ReadonlyArray<string> = ['auth/login', 'auth/register', 'auth/refresh', 'auth/logout'];

  private readonly tokens: TokenStore = inject(TokenStore);
  private readonly session: AuthSession = inject(AuthSession);
  private readonly config: ApiConfig = inject(ApiConfig);
  private readonly router: Router = inject(Router);

  public intercept(request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    if (!request.url.startsWith(this.config.baseUrl) || this.isAuthRequest(request.url)) {
      return next(request);
    }
    return next(this.withToken(request, this.tokens.current())).pipe(
      catchError((error: unknown): Observable<HttpEvent<unknown>> => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
          return throwError((): unknown => error);
        }
        return from(this.session.refresh()).pipe(
          switchMap((renewed: boolean): Observable<HttpEvent<unknown>> => {
            if (!renewed) {
              this.router.navigateByUrl('/auth/login').catch((): void => {
                // La navegación fallida no requiere manejo adicional.
              });
              return throwError((): unknown => error);
            }
            return next(this.withToken(request, this.tokens.current()));
          }),
        );
      }),
    );
  }

  private withToken(request: HttpRequest<unknown>, token: Nullable<string>): HttpRequest<unknown> {
    return token === null ? request : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  private isAuthRequest(url: string): boolean {
    return AuthHttpInterceptor.AUTH_PATHS.some((path: string): boolean => url.endsWith(path));
  }
}

/** Adaptador funcional que Angular registra con `withInterceptors`. */
export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => inject(AuthHttpInterceptor).intercept(request, next);
