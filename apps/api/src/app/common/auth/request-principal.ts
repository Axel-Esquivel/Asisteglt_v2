import { Request } from 'express';
import { Nullable } from '@asisteglt/shared-kernel';
import { AuthenticatedPrincipal } from '../../contexts/iam/domain/ports';

/** Asocia la identidad autenticada a cada petición sin extender el tipo `Request` con `any`. */
export class RequestPrincipal {
  private static readonly PRINCIPALS: WeakMap<Request, AuthenticatedPrincipal> = new WeakMap<
    Request,
    AuthenticatedPrincipal
  >();

  public static attach(request: Request, principal: AuthenticatedPrincipal): void {
    RequestPrincipal.PRINCIPALS.set(request, principal);
  }

  public static of(request: Request): Nullable<AuthenticatedPrincipal> {
    return RequestPrincipal.PRINCIPALS.get(request) ?? null;
  }
}
