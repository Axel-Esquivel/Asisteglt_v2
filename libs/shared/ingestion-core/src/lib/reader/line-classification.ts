import { RecordValues } from '../parse/cell-value';

export enum LineStatus {
  DATA = 'DATA',
  IGNORED = 'IGNORED',
  REJECTED = 'REJECTED',
}

/** Resultado de clasificar una línea: dato (con valores), ignorada (regla) o rechazada (motivos). */
export abstract class LineClassification {
  protected constructor(public readonly lineNumber: number) {}

  public abstract status(): LineStatus;
}

export class DataLine extends LineClassification {
  public constructor(
    lineNumber: number,
    public readonly values: RecordValues,
  ) {
    super(lineNumber);
  }

  public override status(): LineStatus {
    return LineStatus.DATA;
  }
}

export class IgnoredLine extends LineClassification {
  public constructor(
    lineNumber: number,
    public readonly rule: string,
  ) {
    super(lineNumber);
  }

  public override status(): LineStatus {
    return LineStatus.IGNORED;
  }
}

export class RejectedLine extends LineClassification {
  public constructor(
    lineNumber: number,
    public readonly issues: ReadonlyArray<string>,
  ) {
    super(lineNumber);
  }

  public override status(): LineStatus {
    return LineStatus.REJECTED;
  }
}
