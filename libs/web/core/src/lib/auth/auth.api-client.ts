import { Injectable } from '@angular/core';
import { ChangePasswordRequest, LoginRequest, RegisterRequest, UpdateProfileRequest } from '@asisteglt/shared-contracts';
import { Result } from '@asisteglt/shared-kernel';
import { ApiClient } from '../http/api-client';
import { ArrayDecoder, EmptyDecoder } from '../http/decoder';
import {
  ActiveSession,
  ActiveSessionDecoder,
  AuthGrant,
  AuthGrantDecoder,
  CurrentUser,
  CurrentUserDecoder,
} from './current-user';

@Injectable({ providedIn: 'root' })
export class AuthApiClient extends ApiClient {
  private readonly grants: AuthGrantDecoder = new AuthGrantDecoder();
  private readonly users: CurrentUserDecoder = new CurrentUserDecoder();
  private readonly sessions: ArrayDecoder<ActiveSession> = new ArrayDecoder<ActiveSession>(new ActiveSessionDecoder());
  private readonly empty: EmptyDecoder = new EmptyDecoder();

  public login(request: LoginRequest): Promise<Result<AuthGrant>> {
    return this.post('auth/login', request, this.grants);
  }

  public register(request: RegisterRequest): Promise<Result<AuthGrant>> {
    return this.post('auth/register', request, this.grants);
  }

  public refresh(): Promise<Result<AuthGrant>> {
    return this.post('auth/refresh', null, this.grants);
  }

  public logout(): Promise<Result<true>> {
    return this.post('auth/logout', null, this.empty);
  }

  public updateProfile(request: UpdateProfileRequest): Promise<Result<CurrentUser>> {
    return this.patch('users/me', request, this.users);
  }

  public changePassword(request: ChangePasswordRequest): Promise<Result<true>> {
    return this.post('users/me/password', request, this.empty);
  }

  public activeSessions(): Promise<Result<ActiveSession[]>> {
    return this.get('users/me/sessions', this.sessions);
  }

  public revokeSession(id: string): Promise<Result<true>> {
    return this.delete(`users/me/sessions/${encodeURIComponent(id)}`, this.empty);
  }
}
