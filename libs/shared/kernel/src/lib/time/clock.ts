/** Fuente de la hora actual; se inyecta para que el dominio sea determinista en pruebas. */
export abstract class Clock {
  public abstract now(): Date;
}

export class SystemClock extends Clock {
  public override now(): Date {
    return new Date();
  }
}

export class FixedClock extends Clock {
  public constructor(private readonly instant: Date) {
    super();
  }

  public override now(): Date {
    return new Date(this.instant.getTime());
  }
}
