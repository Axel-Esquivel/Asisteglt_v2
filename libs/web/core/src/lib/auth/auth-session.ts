import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LoginRequest, RegisterRequest } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { AuthApiClient } from './auth.api-client';
import { AuthGrant, CurrentUser } from './current-user';
import { TokenStore } from './token-store';

/**
 * Sesión del usuario en el navegador: usuario actual (signal), login/registro/salida y renovación
 * silenciosa con el refresh token en cookie HttpOnly. Una sola renovación en vuelo a la vez.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly api: AuthApiClient = inject(AuthApiClient);
  private readonly tokens: TokenStore = inject(TokenStore);
  private readonly router: Router = inject(Router);
  private readonly user: WritableSignal<Nullable<CurrentUser>> = signal<Nullable<CurrentUser>>(null);
  private refreshInFlight: Nullable<Promise<boolean>> = null;

  public readonly currentUser: Signal<Nullable<CurrentUser>> = this.user.asReadonly();
  public readonly isAuthenticated: Signal<boolean> = computed((): boolean => this.user() !== null);

  /** Intenta recuperar la sesión al iniciar la aplicación (cookie de refresh). */
  public async restore(): Promise<void> {
    await this.refresh();
  }

  public async login(request: LoginRequest): Promise<Result<CurrentUser>> {
    return this.accept(await this.api.login(request));
  }

  public async register(request: RegisterRequest): Promise<Result<CurrentUser>> {
    return this.accept(await this.api.register(request));
  }

  public async logout(): Promise<void> {
    await this.api.logout();
    this.expire();
    await this.router.navigateByUrl('/auth/login');
  }

  public updateUser(user: CurrentUser): void {
    this.user.set(user);
  }

  /** Renueva el access token; devuelve `false` si la sesión ya no es válida. */
  public refresh(): Promise<boolean> {
    if (this.refreshInFlight === null) {
      this.refreshInFlight = this.api
        .refresh()
        .then((result: Result<AuthGrant>): boolean => this.accept(result).isOk())
        .finally((): void => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight;
  }

  public expire(): void {
    this.tokens.clear();
    this.user.set(null);
  }

  private accept(result: Result<AuthGrant>): Result<CurrentUser> {
    return result.match(
      (grant: AuthGrant): Result<CurrentUser> => {
        this.tokens.set(grant.accessToken);
        this.user.set(grant.user);
        return Result.ok(grant.user);
      },
      (error): Result<CurrentUser> => {
        this.expire();
        return Result.fail(error);
      },
    );
  }
}
