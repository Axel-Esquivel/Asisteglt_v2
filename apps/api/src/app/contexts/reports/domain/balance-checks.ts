import { BalanceCheckDto, CheckResultDto, IngestionErrorCode } from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import {
  AggregateRequest,
  AggregateRequestCollector,
  CompiledFormula,
  Evaluator,
  Expression,
  FieldResolver,
  FormulaCompiler,
  FormulaContext,
  FormulaValue,
  Lexer,
  Parser,
  Token,
  ValueKind,
  ValueType,
} from '@asisteglt/shared-formula-engine';
import { Decimal, DomainError, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { RecordAggregates } from './record-aggregates';

class CompiledCheck {
  public constructor(
    public readonly check: BalanceCheckDto,
    public readonly left: Nullable<Expression>,
    public readonly right: Nullable<Expression>,
    public readonly tolerance: Decimal,
  ) {}
}

/**
 * Validaciones de cuadre de una preconfiguración (RF-REP-10): se validan al guardar (tipos,
 * naturaleza y encabezados presentes en la fuente) y se evalúan sobre las líneas de cada archivo.
 */
export class BalanceChecks {
  public static readonly MAX: number = 10;

  private readonly compiled: CompiledCheck[];
  private readonly aggregates: RecordAggregates;

  public constructor(
    checks: ReadonlyArray<BalanceCheckDto>,
    private readonly resolver: FieldResolver,
  ) {
    const parse = (source: string): Nullable<Expression> =>
      new Lexer()
        .tokenize(source)
        .flatMap((tokens: Token[]): Result<Expression> => new Parser(resolver).parse(tokens))
        .match(
          (e: Expression): Nullable<Expression> => e,
          (): Nullable<Expression> => null,
        );
    this.compiled = checks.map(
      (c: BalanceCheckDto): CompiledCheck =>
        new CompiledCheck(
          c,
          parse(c.left),
          parse(c.right),
          Decimal.of(c.tolerance).match(
            (d: Decimal): Decimal => d,
            (): Decimal => Decimal.zero(),
          ),
        ),
    );
    const collector: AggregateRequestCollector = new AggregateRequestCollector(resolver);
    this.aggregates = new RecordAggregates(
      this.compiled.flatMap((c: CompiledCheck): AggregateRequest[] =>
        [c.left, c.right].flatMap((e: Nullable<Expression>): AggregateRequest[] =>
          e === null ? [] : collector.collect(e),
        ),
      ),
    );
  }

  public static validate(
    checks: ReadonlyArray<BalanceCheckDto>,
    resolver: FieldResolver,
    sourceKeys: ReadonlyArray<string>,
  ): Result<BalanceCheckDto[]> {
    if (checks.length > BalanceChecks.MAX) {
      return BalanceChecks.fail(
        `Una preconfiguración admite hasta ${String(BalanceChecks.MAX)} validaciones de cuadre`,
      );
    }
    const valid: BalanceCheckDto[] = [];
    for (const check of checks) {
      const label: string = check.label.trim();
      if (label.length < 1 || label.length > 80) {
        return BalanceChecks.fail('Cada validación necesita un nombre de hasta 80 caracteres');
      }
      const left: Result<CompiledFormula> = BalanceChecks.compile(check.left, resolver, sourceKeys, label);
      if (!left.isOk()) {
        return Result.fail(left.errorOrNull() ?? BalanceChecks.invalid('Fórmula inválida'));
      }
      const right: Result<CompiledFormula> = BalanceChecks.compile(check.right, resolver, sourceKeys, label);
      if (!right.isOk()) {
        return Result.fail(right.errorOrNull() ?? BalanceChecks.invalid('Fórmula inválida'));
      }
      const l: ValueType = left.unwrap().resultType;
      const r: ValueType = right.unwrap().resultType;
      if (
        l.kind !== ValueKind.NUMBER ||
        r.kind !== ValueKind.NUMBER ||
        (!l.literal && !r.literal && l.nature !== r.nature)
      ) {
        return BalanceChecks.fail(`«${label}»: no se puede comparar ${l.describe()} con ${r.describe()}`);
      }
      const tolerance: Nullable<Decimal> = Decimal.of(
        check.tolerance.trim() === '' ? '0' : check.tolerance.trim(),
      ).match(
        (d: Decimal): Nullable<Decimal> => d,
        (): Nullable<Decimal> => null,
      );
      if (tolerance === null || tolerance.isNegative()) {
        return BalanceChecks.fail(`«${label}»: la tolerancia debe ser un número mayor o igual que cero`);
      }
      valid.push({
        label,
        left: left.unwrap().canonicalSource,
        right: right.unwrap().canonicalSource,
        tolerance: tolerance.toString(),
        blocking: check.blocking,
      });
    }
    return Result.ok(valid);
  }

  public isEmpty(): boolean {
    return this.compiled.length === 0;
  }

  public add(values: Readonly<Record<string, CellValue>>): void {
    this.aggregates.add(values);
  }

  public results(): CheckResultDto[] {
    return this.compiled.map((c: CompiledCheck): CheckResultDto => {
      const left: Nullable<Decimal> = this.value(c.left);
      const right: Nullable<Decimal> = this.value(c.right);
      const passed: boolean =
        left !== null && right !== null && left.subtract(right).abs().compareTo(c.tolerance) <= 0;
      return {
        label: c.check.label,
        left: left === null ? null : left.toString(),
        right: right === null ? null : right.toString(),
        passed,
        blocking: c.check.blocking,
      };
    });
  }

  private value(root: Nullable<Expression>): Nullable<Decimal> {
    if (root === null) {
      return null;
    }
    const value: FormulaValue = new Evaluator(this.resolver, this.aggregates).evaluate(root);
    return value instanceof Decimal ? value : null;
  }

  private static compile(
    source: string,
    resolver: FieldResolver,
    sourceKeys: ReadonlyArray<string>,
    label: string,
  ): Result<CompiledFormula> {
    return new FormulaCompiler()
      .compile(source, resolver, FormulaContext.AGGREGATE)
      .match(
        (compiled: CompiledFormula): Result<CompiledFormula> => Result.ok(compiled),
        (e: DomainError): Result<CompiledFormula> => BalanceChecks.fail(`«${label}»: ${e.message}`),
      )
      .flatMap((compiled: CompiledFormula): Result<CompiledFormula> => {
        const missing: Nullable<string> =
          compiled.fieldDependencies.find((key: string): boolean => !sourceKeys.includes(key)) ?? null;
        if (missing === null) {
          return Result.ok(compiled);
        }
        const field = resolver.find(missing);
        return BalanceChecks.fail(
          `«${label}»: «${field === null ? missing : field.label}» no se lee con esta preconfiguración`,
        );
      });
  }

  private static fail<T>(message: string): Result<T> {
    return Result.fail(BalanceChecks.invalid(message));
  }

  private static invalid(message: string): ValidationError {
    return new ValidationError(IngestionErrorCode.INVALID_PROFILE, message);
  }
}
