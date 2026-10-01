import { FieldRole } from '@asisteglt/shared-contracts';
import { Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { ColumnBand, FixedWidthLayout } from '../layout/fixed-width-layout';
import { CellValue } from '../parse/cell-value';
import { ColumnSpec, DerivedAttributeSpec, IdentifierMaskSpec } from '../parse/column-spec';
import { ValueParser } from '../parse/value-parser';
import { RowRule } from '../rules/row-rules';
import { TextMask } from '../rules/text-mask';
import { TextLine } from '../text/text-line';
import { DerivedAttributeCalculator } from './derived-attributes';
import { FixedWidthSpec } from './fixed-width-spec';
import { DataLine, IgnoredLine, LineClassification, LineStatus, RejectedLine } from './line-classification';

class BoundColumn {
  public constructor(
    public readonly spec: ColumnSpec,
    public readonly band: ColumnBand,
    public readonly isLast: boolean,
    public readonly parser: ValueParser,
    public readonly label: string,
    public readonly mask: Nullable<TextMask>,
  ) {}
}

/** Resumen de una lectura: conteos por estado y motivos de rechazo. */
export class ReadSummary {
  public constructor(
    public readonly total: number,
    public readonly data: number,
    public readonly ignored: number,
    public readonly rejected: number,
  ) {}

  public rejectedRatio(): number {
    const candidates: number = this.data + this.rejected;
    return candidates === 0 ? 0 : this.rejected / candidates;
  }
}

/**
 * Lector de ancho fijo: aplica reglas de líneas, corta por divisorias, valida máscaras y convierte
 * los valores. El navegador lo usa para la vista previa y el servidor para la importación real.
 */
export class FixedWidthReader {
  private constructor(
    private readonly layout: FixedWidthLayout,
    private readonly rules: ReadonlyArray<RowRule>,
    private readonly columns: ReadonlyArray<BoundColumn>,
    private readonly derived: ReadonlyArray<DerivedAttributeCalculator>,
  ) {}

  public static create(spec: FixedWidthSpec, labels: ReadonlyMap<string, string>): Result<FixedWidthReader> {
    const layout: Result<FixedWidthLayout> = FixedWidthLayout.of(spec.dividers, spec.lineLength);
    if (!layout.isOk()) {
      return Result.fail(
        layout.errorOrNull() ?? new ValidationError('INVALID_LAYOUT', 'Divisorias inválidas'),
      );
    }
    const bands: ColumnBand[] = layout.unwrap().bands();
    const columns: BoundColumn[] = [];
    for (const column of spec.columns) {
      const band: Nullable<ColumnBand> = bands[column.bandIndex] ?? null;
      if (band === null) {
        return Result.fail(
          new ValidationError('INVALID_COLUMN', `La franja ${String(column.bandIndex + 1)} no existe`),
        );
      }
      const label: string = labels.get(column.fieldKey) ?? column.fieldKey;
      const mask: Nullable<IdentifierMaskSpec> =
        spec.masks.find(
          (m: IdentifierMaskSpec): boolean => m.fieldKey === column.fieldKey && m.pattern.length > 0,
        ) ?? null;
      columns.push(
        new BoundColumn(
          column,
          band,
          band.index === bands.length - 1,
          new ValueParser(column, label),
          label,
          mask === null ? null : TextMask.of(mask.pattern),
        ),
      );
    }
    return Result.ok(
      new FixedWidthReader(
        layout.unwrap(),
        spec.rowRules.map(RowRule.fromSpec),
        columns,
        spec.derived.map(
          (d: DerivedAttributeSpec): DerivedAttributeCalculator => new DerivedAttributeCalculator(d),
        ),
      ),
    );
  }

  public getLayout(): FixedWidthLayout {
    return this.layout;
  }

  public classify(line: TextLine): LineClassification {
    for (const rule of this.rules) {
      if (rule.shouldSkip(line)) {
        return new IgnoredLine(line.number, rule.describe());
      }
    }
    const issues: string[] = [];
    const values: Record<string, CellValue> = {};
    const raws: Map<string, string> = new Map<string, string>();
    for (const column of this.columns) {
      const raw: string = column.band.extract(line, column.isLast);
      raws.set(column.spec.fieldKey, raw);
      const parsed: Result<CellValue> = column.parser.parse(raw);
      parsed.match(
        (value: CellValue): void => {
          values[column.spec.fieldKey] = value;
        },
        (error): void => {
          issues.push(error.message);
        },
      );
      if (column.mask !== null && column.spec.role === FieldRole.IDENTIFIER && parsed.isOk()) {
        const text: string = raw.trim();
        if (!column.mask.matches(text)) {
          issues.push(`«${column.label}» no cumple la máscara ${column.mask.pattern}`);
        }
      }
    }
    if (issues.length > 0) {
      return new RejectedLine(line.number, issues);
    }
    for (const calculator of this.derived) {
      const raw: Nullable<string> = raws.get(calculator.sourceKey) ?? null;
      values[calculator.targetKey] = raw === null ? null : calculator.derive(raw);
    }
    return new DataLine(line.number, values);
  }

  public classifyAll(lines: ReadonlyArray<TextLine>): LineClassification[] {
    return lines.map((line: TextLine): LineClassification => this.classify(line));
  }

  public static summarize(classifications: ReadonlyArray<LineClassification>): ReadSummary {
    let data: number = 0;
    let ignored: number = 0;
    let rejected: number = 0;
    for (const item of classifications) {
      const status: LineStatus = item.status();
      if (status === LineStatus.DATA) {
        data += 1;
      } else if (status === LineStatus.IGNORED) {
        ignored += 1;
      } else {
        rejected += 1;
      }
    }
    return new ReadSummary(classifications.length, data, ignored, rejected);
  }
}
