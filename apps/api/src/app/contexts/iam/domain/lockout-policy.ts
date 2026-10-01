/** Bloqueo progresivo: tras N intentos fallidos se bloquea y la duración se duplica en cada bloqueo. */
export class LockoutPolicy {
  public constructor(
    public readonly maxAttempts: number,
    public readonly baseLockMinutes: number,
  ) {}

  public static standard(): LockoutPolicy {
    return new LockoutPolicy(5, 15);
  }

  public lockDurationMinutes(lockoutCount: number): number {
    return this.baseLockMinutes * 2 ** Math.max(0, lockoutCount - 1);
  }
}
