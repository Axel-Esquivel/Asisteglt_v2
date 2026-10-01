import { Decimal } from '@asisteglt/shared-kernel';

export interface ExpressionVisitor<R> {
  visitNumber(node: NumberLiteral): R;
  visitText(node: TextLiteral): R;
  visitBoolean(node: BooleanLiteral): R;
  visitField(node: FieldReference): R;
  visitUnary(node: UnaryExpression): R;
  visitBinary(node: BinaryExpression): R;
  visitCall(node: FunctionCall): R;
}

/** Nodo del árbol de una fórmula (patrón visitante). */
export abstract class Expression {
  protected constructor(public readonly position: number) {}

  public abstract accept<R>(visitor: ExpressionVisitor<R>): R;
}

export class NumberLiteral extends Expression {
  public constructor(
    public readonly value: Decimal,
    position: number,
  ) {
    super(position);
  }

  public override accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitNumber(this);
  }
}

export class TextLiteral extends Expression {
  public constructor(
    public readonly value: string,
    position: number,
  ) {
    super(position);
  }

  public override accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitText(this);
  }
}

export class BooleanLiteral extends Expression {
  public constructor(
    public readonly value: boolean,
    position: number,
  ) {
    super(position);
  }

  public override accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitBoolean(this);
  }
}

/** Referencia a un encabezado: siempre guarda la clave, nunca el nombre. */
export class FieldReference extends Expression {
  public constructor(
    public readonly key: string,
    position: number,
  ) {
    super(position);
  }

  public override accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitField(this);
  }
}

export class UnaryExpression extends Expression {
  public constructor(
    public readonly operator: '-',
    public readonly operand: Expression,
    position: number,
  ) {
    super(position);
  }

  public override accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitUnary(this);
  }
}

export type BinaryOperator = '+' | '-' | '*' | '/' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export class BinaryExpression extends Expression {
  public constructor(
    public readonly operator: BinaryOperator,
    public readonly left: Expression,
    public readonly right: Expression,
    position: number,
  ) {
    super(position);
  }

  public override accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitBinary(this);
  }

  public static precedence(operator: BinaryOperator): number {
    switch (operator) {
      case '=':
      case '<>':
      case '<':
      case '>':
      case '<=':
      case '>=':
        return 1;
      case '&':
        return 2;
      case '+':
      case '-':
        return 3;
      case '*':
      case '/':
        return 4;
    }
  }
}

export class FunctionCall extends Expression {
  public constructor(
    public readonly name: string,
    public readonly args: ReadonlyArray<Expression>,
    position: number,
  ) {
    super(position);
  }

  public override accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitCall(this);
  }
}
