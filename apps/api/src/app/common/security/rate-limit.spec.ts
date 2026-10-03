import { Clock, TooManyRequestsError } from '@asisteglt/shared-kernel';
import { InMemoryRateLimitStore, RateLimitPolicies, RateLimitPolicy, RateLimiter } from './rate-limit';
import { RecordingSecurityAuditLog, SecurityEvent } from './security-audit-log';

class AdjustableClock extends Clock {
  public constructor(private instant: Date) {
    super();
  }

  public override now(): Date {
    return new Date(this.instant.getTime());
  }

  public set(instant: Date): void {
    this.instant = instant;
  }
}

describe('RateLimiter', () => {
  const policy: RateLimitPolicy = new RateLimitPolicy('prueba', 2, 60);

  it('permite hasta el límite por cliente y luego lanza 429 con el tiempo restante', async (): Promise<void> => {
    const clock: AdjustableClock = new AdjustableClock(new Date('2026-10-01T00:00:00Z'));
    const audit: RecordingSecurityAuditLog = new RecordingSecurityAuditLog();
    const limiter: RateLimiter = new RateLimiter(new InMemoryRateLimitStore(), clock, audit);
    await limiter.consume(policy, '10.0.0.1');
    await limiter.consume(policy, '10.0.0.1');
    await limiter.consume(policy, '10.0.0.2');
    clock.set(new Date('2026-10-01T00:00:45Z'));
    const error: unknown = await limiter.consume(policy, '10.0.0.1').catch((caught: unknown): unknown => caught);
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error instanceof TooManyRequestsError ? error.retryAfterSeconds : 0).toBe(15);
    expect(audit.events()).toEqual([SecurityEvent.RATE_LIMITED]);
  });

  it('reinicia el conteo al terminar la ventana', async (): Promise<void> => {
    const clock: AdjustableClock = new AdjustableClock(new Date('2026-10-01T00:00:00Z'));
    const limiter: RateLimiter = new RateLimiter(
      new InMemoryRateLimitStore(),
      clock,
      new RecordingSecurityAuditLog(),
    );
    await limiter.consume(policy, 'ip');
    await limiter.consume(policy, 'ip');
    clock.set(new Date('2026-10-01T00:01:00Z'));
    await expect(limiter.consume(policy, 'ip')).resolves.toBeUndefined();
  });

  it('deriva las políticas de autenticación del límite por minuto', (): void => {
    const policies: RateLimitPolicies = RateLimitPolicies.forAuth(10);
    expect(policies.find(RateLimitPolicies.LOGIN)).toEqual(new RateLimitPolicy('auth.login', 10, 60));
    expect(policies.find('otra')).toBeNull();
  });
});
