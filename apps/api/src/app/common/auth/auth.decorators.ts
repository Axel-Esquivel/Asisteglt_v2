import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { Nullable } from '@asisteglt/shared-kernel';
import { AuthenticatedPrincipal } from '../../contexts/iam/domain/ports';
import { IamErrors } from '../../contexts/iam/domain/iam-errors';
import { RequestPrincipal } from './request-principal';

export const IS_PUBLIC_ROUTE = 'asisteglt:public-route';

/** Marca una ruta como pública (sin access token). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_ROUTE, true);

/** Inyecta la identidad autenticada de la petición. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request: Request = context.switchToHttp().getRequest<Request>();
    const principal: Nullable<AuthenticatedPrincipal> = RequestPrincipal.of(request);
    if (principal === null) {
      throw IamErrors.unauthenticated();
    }
    return principal;
  },
);
