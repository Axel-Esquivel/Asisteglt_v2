import { Injectable } from '@nestjs/common';
import { CommonErrorCode } from '@asisteglt/shared-contracts';
import { Clock, Nullable, TooManyRequestsError } from '@asisteglt/shared-kernel';
import { SecurityAuditEntry, SecurityAuditLog, SecurityEvent } from './security-audit-log';

/** Límite de peticiones por cliente en una ventana fija. */
export class RateLimitPolicy {
  public constructor(
    public readonly name: string,
    public readonly limit: number,
    public readonly windowSeconds: number,
  ) {}
}

/** Conteo de una ventana: cuántas peticiones lleva y cuándo se reinicia (epoch ms). */
export class WindowCount {
  public constructor(
    public readonly count: number,
    public readonly resetsAt: number,
  ) {}
}

/** Almacén de contadores. En memoria basta con una instancia de API; con varias, usar uno compartido. */
export abstract class RateLimitStore {
  public abstract increment(key: string, windowMs: number, nowMs: number): Promise<WindowCount>;
}

export class InMemoryRateLimitStore extends RateLimitStore {
  private static readonly PRUNE_ABOVE: number = 10_000;
  private readonly windows: Map<string, WindowCount> = new Map<string, WindowCount>();

  public override increment(key: string, windowMs: number, nowMs: number): Promise<WindowCount> {
    if (this.windows.size > InMemoryRateLimitStore.PRUNE_ABOVE) {
      this.prune(nowMs);
    }
    const current: Nullable<WindowCount> = this.windows.get(key) ?? null;
    const next: WindowCount =
      current === null || current.resetsAt <= nowMs
        ? new WindowCount(1, nowMs + windowMs)
        : new WindowCount(current.count + 1, current.resetsAt);
    this.windows.set(key, next);
    return Promise.resolve(next);
  }

  private prune(nowMs: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetsAt <= nowMs) {
        this.windows.delete(key);
      }
    }
  }
}

/** Políticas con nombre, configuradas al arrancar. */
export class RateLimitPolicies {
  public static readonly LOGIN: string = 'auth.login';
  public static readonly REGISTER: string = 'auth.register';
  public static readonly REFRESH: string = 'auth.refresh';

  private readonly byName: Map<string, RateLimitPolicy>;

  public constructor(policies: ReadonlyArray<RateLimitPolicy>) {
    this.byName = new Map<string, RateLimitPolicy>(
      policies.map((policy: RateLimitPolicy): [string, RateLimitPolicy] => [policy.name, policy]),
    );
  }

  /** `perMinute` intentos de login por IP; registro y refresh se derivan de ese valor. */
  public static forAuth(perMinute: number): RateLimitPolicies {
    return new RateLimitPolicies([
      new RateLimitPolicy(RateLimitPolicies.LOGIN, perMinute, 60),
      new RateLimitPolicy(RateLimitPolicies.REGISTER, perMinute, 600),
      new RateLimitPolicy(RateLimitPolicies.REFRESH, perMinute * 6, 60),
    ]);
  }

  public find(name: string): Nullable<RateLimitPolicy> {
    return this.byName.get(name) ?? null;
  }
}

/** Aplica una política a un cliente; al superarla audita y lanza `TooManyRequestsError` (429). */
@Injectable()
export class RateLimiter {
  public constructor(
    private readonly store: RateLimitStore,
    private readonly clock: Clock,
    private readonly audit: SecurityAuditLog,
  ) {}

  public async consume(policy: RateLimitPolicy, clientKey: string): Promise<void> {
    const nowMs: number = this.clock.now().getTime();
    const window: WindowCount = await this.store.increment(
      `${policy.name}|${clientKey}`,
      policy.windowSeconds * 1000,
      nowMs,
    );
    if (window.count <= policy.limit) {
      return;
    }
    const retryAfterSeconds: number = Math.max(1, Math.ceil((window.resetsAt - nowMs) / 1000));
    if (window.count === policy.limit + 1) {
      this.audit.record(SecurityAuditEntry.of(SecurityEvent.RATE_LIMITED, null, clientKey, policy.name));
    }
    throw new TooManyRequestsError(
      CommonErrorCode.TOO_MANY_REQUESTS,
      `Demasiados intentos; vuelve a intentarlo en ${String(retryAfterSeconds)} s`,
      retryAfterSeconds,
    );
  }
}
