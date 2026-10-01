import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { AccountService } from '../../contexts/iam/application/account.use-cases';
import { IamErrors } from '../../contexts/iam/domain/iam-errors';
import { AccessTokenIssuer, AuthenticatedPrincipal } from '../../contexts/iam/domain/ports';
import { IS_PUBLIC_ROUTE } from './auth.decorators';
import { RequestPrincipal } from './request-principal';

/** Guard global: exige `Authorization: Bearer <token>` vigente salvo en rutas `@Public()`. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenIssuer,
    private readonly accounts: AccountService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic: boolean =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()]) ?? false;
    if (isPublic || context.getType() !== 'http') {
      return true;
    }
    const request: Request = context.switchToHttp().getRequest<Request>();
    const token: Nullable<string> = AccessTokenGuard.bearer(request.header('authorization') ?? null);
    if (token === null) {
      throw IamErrors.unauthenticated();
    }
    const principal: Result<AuthenticatedPrincipal> = await this.tokens.verify(token);
    const resolved: AuthenticatedPrincipal = principal.unwrap();
    if (!(await this.accounts.isSessionActive(resolved.sessionId))) {
      throw IamErrors.sessionExpired();
    }
    RequestPrincipal.attach(request, resolved);
    return true;
  }

  private static bearer(header: Nullable<string>): Nullable<string> {
    if (header === null) {
      return null;
    }
    const match: Nullable<RegExpExecArray> = /^Bearer\s+(.+)$/i.exec(header);
    return match === null ? null : (match[1] ?? null);
  }
}
