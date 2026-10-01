import { RowRuleKind, RowRuleSpec, TextOperator } from '@asisteglt/shared-contracts';
import { TextLine } from '../text/text-line';
import { LineSignature } from './text-mask';

export { RowRuleKind, TextOperator } from '@asisteglt/shared-contracts';
export type { RowRuleSpec } from '@asisteglt/shared-contracts';

/** Regla de exclusión de líneas; la primera que coincide marca la línea como ignorada. */
export abstract class RowRule {
  public static fromSpec(spec: RowRuleSpec): RowRule {
    switch (spec.kind) {
      case RowRuleKind.SKIP_BLANK:
        return new SkipBlankLinesRule();
      case RowRuleKind.SKIP_PAGE_BREAKS:
        return new SkipPageBreaksRule();
      case RowRuleKind.SKIP_LEADING:
        return new SkipLeadingLinesRule(spec.count);
      case RowRuleKind.SKIP_MATCHING:
        return new SkipMatchingTextRule(spec.operator, spec.text);
      case RowRuleKind.PAGE_HEADER_BLOCK:
        return new PageHeaderBlockRule(spec.signatures);
    }
  }

  public abstract shouldSkip(line: TextLine): boolean;
  public abstract describe(): string;
  public abstract toSpec(): RowRuleSpec;

  protected static spec(kind: RowRuleKind): RowRuleSpec {
    return { kind, count: 0, operator: TextOperator.STARTS_WITH, text: '', signatures: [] };
  }
}

export class SkipBlankLinesRule extends RowRule {
  public override shouldSkip(line: TextLine): boolean {
    return line.isBlank();
  }

  public override describe(): string {
    return 'Línea en blanco';
  }

  public override toSpec(): RowRuleSpec {
    return RowRule.spec(RowRuleKind.SKIP_BLANK);
  }
}

export class SkipPageBreaksRule extends RowRule {
  public override shouldSkip(line: TextLine): boolean {
    return line.pageBreak && line.isBlank();
  }

  public override describe(): string {
    return 'Salto de página';
  }

  public override toSpec(): RowRuleSpec {
    return RowRule.spec(RowRuleKind.SKIP_PAGE_BREAKS);
  }
}

export class SkipLeadingLinesRule extends RowRule {
  public constructor(private readonly count: number) {
    super();
  }

  public override shouldSkip(line: TextLine): boolean {
    return line.number <= this.count;
  }

  public override describe(): string {
    return `Primeras ${String(this.count)} líneas`;
  }

  public override toSpec(): RowRuleSpec {
    return { ...RowRule.spec(RowRuleKind.SKIP_LEADING), count: this.count };
  }
}

export class SkipMatchingTextRule extends RowRule {
  private readonly needle: string;

  public constructor(
    private readonly operator: TextOperator,
    private readonly text: string,
  ) {
    super();
    this.needle = text.trim().toLocaleLowerCase();
  }

  public override shouldSkip(line: TextLine): boolean {
    if (this.needle.length === 0) {
      return false;
    }
    const value: string = line.text.trim().toLocaleLowerCase();
    switch (this.operator) {
      case TextOperator.STARTS_WITH:
        return value.startsWith(this.needle);
      case TextOperator.CONTAINS:
        return value.includes(this.needle);
      case TextOperator.ENDS_WITH:
        return value.endsWith(this.needle);
    }
  }

  public override describe(): string {
    const verb: string =
      this.operator === TextOperator.STARTS_WITH
        ? 'comienza con'
        : this.operator === TextOperator.CONTAINS
          ? 'contiene'
          : 'termina con';
    return `Línea que ${verb} «${this.text.trim()}»`;
  }

  public override toSpec(): RowRuleSpec {
    return { ...RowRule.spec(RowRuleKind.SKIP_MATCHING), operator: this.operator, text: this.text };
  }
}

/** Bloque de encabezado de página: ignora cada reaparición aunque cambien fecha, hora o página. */
export class PageHeaderBlockRule extends RowRule {
  private readonly signatures: ReadonlySet<string>;

  public constructor(signatures: ReadonlyArray<string>) {
    super();
    this.signatures = new Set<string>(signatures.filter((s: string): boolean => s.length > 0));
  }

  public static fromLines(lines: ReadonlyArray<TextLine>): PageHeaderBlockRule {
    return new PageHeaderBlockRule(lines.map((line: TextLine): string => LineSignature.of(line.text)));
  }

  public override shouldSkip(line: TextLine): boolean {
    return this.signatures.has(LineSignature.of(line.text));
  }

  public override describe(): string {
    return `Encabezado de página (${String(this.signatures.size)} líneas)`;
  }

  public override toSpec(): RowRuleSpec {
    return { ...RowRule.spec(RowRuleKind.PAGE_HEADER_BLOCK), signatures: [...this.signatures] };
  }
}
