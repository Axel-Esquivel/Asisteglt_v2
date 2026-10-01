import { NumericNature } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
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
import { FormulaError, FormulaErrorCode } from './formula-errors';
import { FormulaFunctions } from './functions';
import { ValueKind, ValueType } from './value-type';

/** Por registro (campos calculados) o agregado (celdas, KPI, validaciones de totales). */
export enum FormulaContext {
  RECORD = 'RECORD',
  AGGREGATE = 'AGGREGATE',
}

class TypeFailure extends Error {
  public constructor(public readonly error: FormulaError) {
    super(error.message);
  }
}

/**
 * Verifica tipos antes de evaluar (docs/12 §2.6 y §2.8.3): no se opera texto con números, no se
 * suman tasas ni precios unitarios, y la naturaleza del resultado se deduce (Monto ÷ Cantidad =
 * Precio unitario, Monto ÷ Monto = Tasa…).
 */
export class TypeChecker implements ExpressionVisitor<ValueType> {
  public constructor(
    private readonly fields: FieldResolver,
    private readonly context: FormulaContext,
  ) {}

  public check(root: Expression): Result<ValueType> {
    try {
      return Result.ok(root.accept(this));
    } catch (error: unknown) {
      if (error instanceof TypeFailure) {
        return Result.fail(error.error);
      }
      throw error;
    }
  }

  public visitNumber(_node: NumberLiteral): ValueType {
    return ValueType.literal();
  }

  public visitText(_node: TextLiteral): ValueType {
    return ValueType.text();
  }

  public visitBoolean(_node: BooleanLiteral): ValueType {
    return ValueType.boolean();
  }

  public visitField(node: FieldReference): ValueType {
    const field: FieldInfo = this.field(node);
    if (this.context === FormulaContext.AGGREGATE) {
      if (!field.isAggregatable()) {
        throw TypeChecker.fail(
          FormulaErrorCode.FIELD_NOT_AGGREGATABLE,
          `«${field.label}» no se puede sumar ni promediar`,
          node,
        );
      }
      return ValueType.number(field.nature ?? NumericNature.DESCRIPTIVE);
    }
    return ValueType.ofField(field);
  }

  public visitUnary(node: UnaryExpression): ValueType {
    const operand: ValueType = node.operand.accept(this);
    if (!operand.isNumber()) {
      throw TypeChecker.mismatch(`No se puede cambiar el signo de ${operand.describe()}`, node);
    }
    return operand;
  }

  public visitBinary(node: BinaryExpression): ValueType {
    const left: ValueType = node.left.accept(this);
    const right: ValueType = node.right.accept(this);
    switch (node.operator) {
      case '&':
        return ValueType.text();
      case '=':
      case '<>':
      case '<':
      case '>':
      case '<=':
      case '>=':
        if (left.kind !== right.kind) {
          throw TypeChecker.mismatch(`No se puede comparar ${left.describe()} con ${right.describe()}`, node);
        }
        return ValueType.boolean();
      case '+':
      case '-':
        return this.additive(node, left, right);
      case '*':
        return this.product(node, left, right);
      case '/':
        return this.quotient(node, left, right);
    }
  }

  public visitCall(node: FunctionCall): ValueType {
    if (!FormulaFunctions.exists(node.name)) {
      throw TypeChecker.fail(FormulaErrorCode.UNKNOWN_FUNCTION, `No existe la función ${node.name}`, node);
    }
    if (FormulaFunctions.isAggregate(node.name)) {
      return this.aggregate(node);
    }
    const args: ValueType[] = node.args.map((a: Expression): ValueType => a.accept(this));
    switch (node.name) {
      case 'SI': {
        this.arity(node, 3, 3);
        const condition: ValueType = args[0] ?? ValueType.literal();
        if (condition.kind !== ValueKind.BOOLEAN) {
          throw TypeChecker.mismatch('La condición de SI debe ser una comparación (sí/no)', node);
        }
        return this.unify(node, args[1] ?? ValueType.literal(), args[2] ?? ValueType.literal());
      }
      case 'DIVIDIR':
        this.arity(node, 2, 2);
        return this.quotient(node, args[0] ?? ValueType.literal(), args[1] ?? ValueType.literal());
      case 'ABS':
        this.arity(node, 1, 1);
        return this.numeric(node, args[0] ?? ValueType.literal());
      case 'REDONDEAR': {
        this.arity(node, 2, 2);
        const places: Nullable<Expression> = node.args[1] ?? null;
        if (!(places instanceof NumberLiteral)) {
          throw TypeChecker.mismatch(
            'El segundo argumento de REDONDEAR debe ser un número de decimales',
            node,
          );
        }
        return this.numeric(node, args[0] ?? ValueType.literal());
      }
      case 'ESVACIO':
        this.arity(node, 1, 1);
        return ValueType.boolean();
      case 'NO':
        this.arity(node, 1, 1);
        return this.booleans(node, args);
      default:
        this.arity(node, 1, 30);
        return this.booleans(node, args);
    }
  }

  private aggregate(node: FunctionCall): ValueType {
    if (this.context === FormulaContext.RECORD) {
      throw TypeChecker.fail(
        FormulaErrorCode.AGGREGATE_NOT_ALLOWED,
        `${node.name} no se permite en un cálculo por registro`,
        node,
      );
    }
    this.arity(node, 1, node.name === 'PROMEDIO.PONDERADO' ? 2 : 1);
    const target: Nullable<Expression> = node.args[0] ?? null;
    if (!(target instanceof FieldReference)) {
      throw TypeChecker.mismatch(`${node.name} recibe un encabezado entre corchetes`, node);
    }
    const field: FieldInfo = this.field(target);
    if (node.name === 'CONTAR') {
      return ValueType.number(NumericNature.DESCRIPTIVE);
    }
    if (!field.isAggregatable()) {
      throw TypeChecker.fail(
        FormulaErrorCode.FIELD_NOT_AGGREGATABLE,
        `«${field.label}» no se puede sumar ni promediar`,
        node,
      );
    }
    const nature: NumericNature = field.nature ?? NumericNature.DESCRIPTIVE;
    if (node.name === 'SUMA' && (nature === NumericNature.RATE || nature === NumericNature.UNIT_PRICE)) {
      const what: string = nature === NumericNature.RATE ? 'Una tasa' : 'Un precio unitario';
      throw TypeChecker.fail(
        FormulaErrorCode.FIELD_NOT_AGGREGATABLE,
        `${what} no se puede sumar; use PROMEDIO.PONDERADO`,
        node,
      );
    }
    if (node.name === 'PROMEDIO.PONDERADO') {
      const weight: Nullable<Expression> = node.args[1] ?? null;
      const weightField: Nullable<FieldInfo> =
        weight instanceof FieldReference
          ? this.field(weight)
          : field.weightKey === null
            ? null
            : this.fields.find(field.weightKey);
      if (
        weightField === null ||
        (weightField.nature !== NumericNature.AMOUNT && weightField.nature !== NumericNature.QUANTITY)
      ) {
        throw TypeChecker.mismatch(
          'PROMEDIO.PONDERADO necesita un peso que sea un Monto o una Cantidad',
          node,
        );
      }
    }
    return ValueType.number(nature);
  }

  private additive(node: BinaryExpression, left: ValueType, right: ValueType): ValueType {
    const verb: string = node.operator === '+' ? 'sumar' : 'restar';
    if (node.operator === '-' && left.kind === ValueKind.DATE && right.kind === ValueKind.DATE) {
      return ValueType.number(NumericNature.DESCRIPTIVE);
    }
    if (!left.isNumber() || !right.isNumber()) {
      throw TypeChecker.mismatch(`No se puede ${verb} ${left.label} con ${right.label}`, node);
    }
    if (left.literal) {
      return right;
    }
    if (right.literal || left.nature === right.nature) {
      return left;
    }
    throw TypeChecker.mismatch(`No se puede ${verb} ${left.describe()} con ${right.describe()}`, node);
  }

  private product(node: BinaryExpression, left: ValueType, right: ValueType): ValueType {
    this.numeric(node, left);
    this.numeric(node, right);
    if (left.literal) {
      return right;
    }
    if (right.literal || right.nature === NumericNature.DESCRIPTIVE) {
      return left;
    }
    if (left.nature === NumericNature.DESCRIPTIVE) {
      return right;
    }
    const pair = (a: NumericNature, b: NumericNature): boolean =>
      (left.nature === a && right.nature === b) || (left.nature === b && right.nature === a);
    if (pair(NumericNature.QUANTITY, NumericNature.UNIT_PRICE)) {
      return ValueType.number(NumericNature.AMOUNT);
    }
    if (pair(NumericNature.AMOUNT, NumericNature.RATE)) {
      return ValueType.number(NumericNature.AMOUNT);
    }
    if (pair(NumericNature.QUANTITY, NumericNature.RATE)) {
      return ValueType.number(NumericNature.QUANTITY);
    }
    if (pair(NumericNature.UNIT_PRICE, NumericNature.RATE)) {
      return ValueType.number(NumericNature.UNIT_PRICE);
    }
    if (pair(NumericNature.RATE, NumericNature.RATE)) {
      return ValueType.number(NumericNature.RATE);
    }
    throw TypeChecker.mismatch(`No se puede multiplicar ${left.describe()} por ${right.describe()}`, node);
  }

  private quotient(node: Expression, left: ValueType, right: ValueType): ValueType {
    this.numeric(node, left);
    this.numeric(node, right);
    if (right.literal || right.nature === NumericNature.DESCRIPTIVE) {
      return left;
    }
    if (left.literal) {
      return ValueType.number(NumericNature.DESCRIPTIVE);
    }
    if (left.nature === right.nature) {
      return ValueType.number(NumericNature.RATE);
    }
    const is = (a: NumericNature, b: NumericNature): boolean => left.nature === a && right.nature === b;
    if (is(NumericNature.AMOUNT, NumericNature.QUANTITY)) {
      return ValueType.number(NumericNature.UNIT_PRICE);
    }
    if (is(NumericNature.AMOUNT, NumericNature.UNIT_PRICE)) {
      return ValueType.number(NumericNature.QUANTITY);
    }
    if (right.nature === NumericNature.RATE) {
      return left;
    }
    throw TypeChecker.mismatch(`No se puede dividir ${left.describe()} entre ${right.describe()}`, node);
  }

  private unify(node: Expression, a: ValueType, b: ValueType): ValueType {
    if (a.kind !== b.kind) {
      throw TypeChecker.mismatch(
        `Los resultados de SI deben ser del mismo tipo (${a.describe()} y ${b.describe()})`,
        node,
      );
    }
    if (a.isNumber() && !a.literal && !b.literal && a.nature !== b.nature) {
      throw TypeChecker.mismatch(
        `Los resultados de SI deben tener la misma naturaleza (${a.describe()} y ${b.describe()})`,
        node,
      );
    }
    return a.literal ? b : a;
  }

  private numeric(node: Expression, type: ValueType): ValueType {
    if (!type.isNumber()) {
      throw TypeChecker.mismatch(`Se esperaba un número y se recibió ${type.describe()}`, node);
    }
    return type;
  }

  private booleans(node: FunctionCall, args: ReadonlyArray<ValueType>): ValueType {
    if (args.some((a: ValueType): boolean => a.kind !== ValueKind.BOOLEAN)) {
      throw TypeChecker.mismatch(`${node.name} recibe condiciones (sí/no)`, node);
    }
    return ValueType.boolean();
  }

  private arity(node: FunctionCall, min: number, max: number): void {
    if (node.args.length < min || node.args.length > max) {
      const expected: string = min === max ? String(min) : `entre ${String(min)} y ${String(max)}`;
      throw TypeChecker.fail(
        FormulaErrorCode.ARGUMENT_COUNT,
        `${node.name} recibe ${expected} argumentos`,
        node,
      );
    }
  }

  private field(node: FieldReference): FieldInfo {
    const field: Nullable<FieldInfo> = this.fields.find(node.key);
    if (field === null) {
      throw TypeChecker.fail(FormulaErrorCode.UNKNOWN_FIELD, `No existe el encabezado [#${node.key}]`, node);
    }
    return field;
  }

  private static mismatch(message: string, node: Expression): TypeFailure {
    return TypeChecker.fail(FormulaErrorCode.VALUE_TYPE_MISMATCH, message, node);
  }

  private static fail(code: FormulaErrorCode, message: string, node: Expression): TypeFailure {
    return new TypeFailure(new FormulaError(code, message, node.position));
  }
}
