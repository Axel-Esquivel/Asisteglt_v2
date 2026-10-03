import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Nullable } from '@asisteglt/shared-kernel';
import { ClientInfo } from '../http/client-info';
import { RateLimitPolicies, RateLimitPolicy, RateLimiter } from './rate-limit';

export const RATE_LIMIT_POLICY = 'asisteglt:rate-limit-policy';

/** Limita la ruta por IP de cliente con la política indicada (ver `RateLimitPolicies`). */
export const RateLimited = (policyName: string): MethodDecorator =>
  SetMetadata(RATE_LIMIT_POLICY, policyName);

/** Guard global: solo actúa en rutas marcadas con `@RateLimited`. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly policies: RateLimitPolicies,
    private readonly limiter: RateLimiter,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const name: Nullable<string> =
      this.reflector.get<string>(RATE_LIMIT_POLICY, context.getHandler()) ?? null;
    const policy: Nullable<RateLimitPolicy> = name === null ? null : this.policies.find(name);
    if (policy === null) {
      return true;
    }
    await this.limiter.consume(policy, ClientInfo.ipAddress(context.switchToHttp().getRequest<Request>()));
    return true;
  }
}
