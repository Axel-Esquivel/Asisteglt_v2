import { Aggregation, DataType } from '@asisteglt/shared-contracts';
import { Decimal, Nullable, RoundingMode } from '@asisteglt/shared-kernel';
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
import { FormulaContext } from './type-checker';

/** Valor durante la evaluación: número (`Decimal`), texto o fecha `AAAA-MM-DD`, sí/no o vacío. */
export type FormulaValue = Decimal | string | boolean | null;

/** Valor crudo de un registro: decimal canónico en texto, texto, fecha, sí/no o vacío. */
export type RawValue = string | boolean | null;

/** De dónde salen los valores de los encabezados. */
export abstract class EvaluationContext {
  public abstract kind(): FormulaContext;
  /** Valor de un encabezado en el registro actual (contexto por registro). */
  public abstract raw(key: string): RawValue;
  /** Agregación de un encabezado bajo los filtros actuales (contexto agregado). */
  public abstract aggregate(
    key: string,
    aggregation: Aggregation,
    weightKey: Nullable<string>,
  ): Nullable<Decimal>;
}

/** Contexto por registro sobre los valores de `data_records`. */
export class RecordContext extends EvaluationContext {
  public constructor(private readonly values: Readonly<Record<string, RawValue>>) {
    super();
  }

  public override kind(): FormulaContext {
    return FormulaContext.RECORD;
  }

  public override raw(key: string): RawValue {
    return this.values[key] ?? null;
  }

  public override aggregate(
    _key: string,
    _aggregation: Aggregation,
    _weightKey: Nullable<string>,
  ): Nullable<Decimal> {
    return null;
  }
}

/**
 * Evalúa un árbol ya verificado. Un vacío se propaga (vacío + 5 = vacío) y la división entre cero
 * da vacío, nunca un error en tiempo de ejecución.
 */
export class Evaluator implements ExpressionVisitor<FormulaValue> {
  public constructor(
    private readonly fields: FieldResolver,
    private readonly context: EvaluationContext,
  ) {}

  public evaluate(root: Expression): FormulaValue {
    return root.accept(this);
  }

  public visitNumber(node: NumberLiteral): FormulaValue {
    return node.value;
  }

  public visitText(node: TextLiteral): FormulaValue {
    return node.value;
  }

  public visitBoolean(node: BooleanLiteral): FormulaValue {
    return node.value;
  }

  public visitField(node: FieldReference): FormulaValue {
    const field: Nullable<FieldInfo> = this.fields.find(node.key);
    if (field === null) {
      return null;
    }
    if (this.context.kind() === FormulaContext.AGGREGATE) {
      return this.context.aggregate(node.key, field.aggregation, field.weightKey);
    }
    const raw: RawValue = this.context.raw(node.key);
    if (
      typeof raw === 'string' &&
      (field.dataType === DataType.INTEGER || field.dataType === DataType.DECIMAL)
    ) {
      return Decimal.of(raw).match(
        (d: Decimal): FormulaValue => d,
        (): FormulaValue => null,
      );
    }
    return raw;
  }

  public visitUnary(node: UnaryExpression): FormulaValue {
    const value: FormulaValue = node.operand.accept(this);
    return value instanceof Decimal ? value.negate() : null;
  }

  public visitBinary(node: BinaryExpression): FormulaValue {
    const left: FormulaValue = node.left.accept(this);
    const right: FormulaValue = node.right.accept(this);
    switch (node.operator) {
      case '&':
        return `${Evaluator.text(left)}${Evaluator.text(right)}`;
      case '=':
      case '<>':
      case '<':
      case '>':
      case '<=':
      case '>=':
        return Evaluator.compare(node.operator, left, right);
      case '+':
      case '-':
      case '*':
      case '/':
        return Evaluator.arithmetic(node.operator, left, right);
    }
  }

  public visitCall(node: FunctionCall): FormulaValue {
    const aggregation: Nullable<Aggregation> = FormulaFunctions.AGGREGATES.get(node.name) ?? null;
    if (aggregation !== null) {
      const target: Nullable<Expression> = node.args[0] ?? null;
      const weight: Nullable<Expression> = node.args[1] ?? null;
      if (!(target instanceof FieldReference)) {
        return null;
      }
      const field: Nullable<FieldInfo> = this.fields.find(target.key);
      const weightKey: Nullable<string> =
        weight instanceof FieldReference ? weight.key : field === null ? null : field.weightKey;
      return this.context.aggregate(target.key, aggregation, weightKey);
    }
    const arg = (index: number): FormulaValue => {
      const expression: Nullable<Expression> = node.args[index] ?? null;
      return expression === null ? null : expression.accept(this);
    };
    switch (node.name) {
      case 'SI':
        return arg(0) === true ? arg(1) : arg(2);
      case 'DIVIDIR':
        return Evaluator.arithmetic('/', arg(0), arg(1));
      case 'ABS': {
        const value: FormulaValue = arg(0);
        return value instanceof Decimal ? value.abs() : null;
      }
      case 'REDONDEAR': {
        const value: FormulaValue = arg(0);
        const places: FormulaValue = arg(1);
        return value instanceof Decimal && places instanceof Decimal
          ? value.round(Number(places.toString()), RoundingMode.HALF_UP)
          : null;
      }
      case 'ESVACIO': {
        const value: FormulaValue = arg(0);
        return value === null || value === '';
      }
      case 'NO':
        return arg(0) !== true;
      case 'Y':
        return node.args.every((_e: Expression, i: number): boolean => arg(i) === true);
      case 'O':
        return node.args.some((_e: Expression, i: number): boolean => arg(i) === true);
      default:
        return null;
    }
  }

  private static arithmetic(
    operator: '+' | '-' | '*' | '/',
    left: FormulaValue,
    right: FormulaValue,
  ): FormulaValue {
    if (operator === '-' && typeof left === 'string' && typeof right === 'string') {
      const days: number = (Date.parse(left) - Date.parse(right)) / 86_400_000;
      return Number.isFinite(days) ? Decimal.fromInteger(Math.round(days)).unwrap() : null;
    }
    if (!(left instanceof Decimal) || !(right instanceof Decimal)) {
      return null;
    }
    switch (operator) {
      case '+':
        return left.add(right);
      case '-':
        return left.subtract(right);
      case '*':
        return left.multiply(right);
      case '/':
        return right.isZero()
          ? null
          : left.divide(right).match(
              (d: Decimal): FormulaValue => d,
              (): FormulaValue => null,
            );
    }
  }

  private static compare(
    operator: '=' | '<>' | '<' | '>' | '<=' | '>=',
    left: FormulaValue,
    right: FormulaValue,
  ): boolean {
    if (left === null || right === null) {
      return operator === '=' ? left === right : operator === '<>' ? left !== right : false;
    }
    const order: number =
      left instanceof Decimal && right instanceof Decimal
        ? left.compareTo(right)
        : typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right, 'es', { sensitivity: 'base' })
          : left === right
            ? 0
            : 1;
    switch (operator) {
      case '=':
        return order === 0;
      case '<>':
        return order !== 0;
      case '<':
        return order < 0;
      case '>':
        return order > 0;
      case '<=':
        return order <= 0;
      case '>=':
        return order >= 0;
    }
  }

  private static text(value: FormulaValue): string {
    if (value === null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }
    return value instanceof Decimal ? value.toString() : value;
  }
}
