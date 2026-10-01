import { Aggregation } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import {
  BinaryExpression,
  BooleanLiteral,
  Expression,
  ExpressionVisitor,
  FieldReference,
  FunctionCall,
  NumberLiteral,
  TextLiteral,
  UnaryExpression,
} from './ast';
import { FieldInfo, FieldResolver } from './field-resolver';
import { FormulaFunctions } from './functions';

/** Una agregación que el contexto agregado deberá responder: encabezado, cómo y con qué peso. */
export class AggregateRequest {
  public constructor(
    public readonly key: string,
    public readonly aggregation: Aggregation,
    public readonly weightKey: Nullable<string>,
  ) {}

  public id(): string {
    return AggregateRequest.idOf(this.key, this.aggregation, this.weightKey);
  }

  public static idOf(key: string, aggregation: Aggregation, weightKey: Nullable<string>): string {
    return `${key}|${aggregation}|${weightKey ?? ''}`;
  }
}

/**
 * Recorre una fórmula agregada y lista las agregaciones que pedirá el `Evaluator` (mismas reglas:
 * `[X]` usa la agregación del encabezado; `SUMA([X])` la explícita), para precalcularlas.
 */
export class AggregateRequestCollector implements ExpressionVisitor<AggregateRequest[]> {
  public constructor(private readonly fields: FieldResolver) {}

  public collect(root: Expression): AggregateRequest[] {
    const unique: Map<string, AggregateRequest> = new Map<string, AggregateRequest>();
    for (const request of root.accept(this)) {
      unique.set(request.id(), request);
    }
    return [...unique.values()];
  }

  public visitNumber(_node: NumberLiteral): AggregateRequest[] {
    return [];
  }

  public visitText(_node: TextLiteral): AggregateRequest[] {
    return [];
  }

  public visitBoolean(_node: BooleanLiteral): AggregateRequest[] {
    return [];
  }

  public visitField(node: FieldReference): AggregateRequest[] {
    const field: Nullable<FieldInfo> = this.fields.find(node.key);
    return field === null ? [] : [new AggregateRequest(node.key, field.aggregation, field.weightKey)];
  }

  public visitUnary(node: UnaryExpression): AggregateRequest[] {
    return node.operand.accept(this);
  }

  public visitBinary(node: BinaryExpression): AggregateRequest[] {
    return [...node.left.accept(this), ...node.right.accept(this)];
  }

  public visitCall(node: FunctionCall): AggregateRequest[] {
    const aggregation: Nullable<Aggregation> = FormulaFunctions.AGGREGATES.get(node.name) ?? null;
    if (aggregation === null) {
      return node.args.flatMap((a: Expression): AggregateRequest[] => a.accept(this));
    }
    const target: Nullable<Expression> = node.args[0] ?? null;
    const weight: Nullable<Expression> = node.args[1] ?? null;
    if (!(target instanceof FieldReference)) {
      return [];
    }
    const field: Nullable<FieldInfo> = this.fields.find(target.key);
    const weightKey: Nullable<string> =
      weight instanceof FieldReference ? weight.key : field === null ? null : field.weightKey;
    return [new AggregateRequest(target.key, aggregation, weightKey)];
  }
}
