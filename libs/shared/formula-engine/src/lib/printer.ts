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

/**
 * Escribe un árbol como texto: en forma canónica (`[#clave]`, lo que se guarda) o con los
 * nombres vigentes (lo que ve el usuario). Solo pone los paréntesis necesarios.
 */
export class FormulaPrinter implements ExpressionVisitor<string> {
  private constructor(private readonly labels: Nullable<FieldResolver>) {}

  public static canonical(): FormulaPrinter {
    return new FormulaPrinter(null);
  }

  public static display(fields: FieldResolver): FormulaPrinter {
    return new FormulaPrinter(fields);
  }

  public print(root: Expression): string {
    return `=${root.accept(this)}`;
  }

  public visitNumber(node: NumberLiteral): string {
    return node.value.toString();
  }

  public visitText(node: TextLiteral): string {
    return `"${node.value.replace(/"/g, '""')}"`;
  }

  public visitBoolean(node: BooleanLiteral): string {
    return node.value ? 'VERDADERO' : 'FALSO';
  }

  public visitField(node: FieldReference): string {
    if (this.labels === null) {
      return `[#${node.key}]`;
    }
    const field: Nullable<FieldInfo> = this.labels.find(node.key);
    return field === null ? `[#${node.key}]` : `[${field.label}]`;
  }

  public visitUnary(node: UnaryExpression): string {
    const inner: string = node.operand.accept(this);
    return node.operand instanceof BinaryExpression ? `-(${inner})` : `-${inner}`;
  }

  public visitBinary(node: BinaryExpression): string {
    const precedence: number = BinaryExpression.precedence(node.operator);
    const side = (child: Expression, right: boolean): string => {
      const text: string = child.accept(this);
      if (!(child instanceof BinaryExpression)) {
        return text;
      }
      const inner: number = BinaryExpression.precedence(child.operator);
      const needs: boolean =
        inner < precedence ||
        (right && inner === precedence && (node.operator === '-' || node.operator === '/'));
      return needs ? `(${text})` : text;
    };
    return `${side(node.left, false)} ${node.operator} ${side(node.right, true)}`;
  }

  public visitCall(node: FunctionCall): string {
    return `${node.name}(${node.args.map((a: Expression): string => a.accept(this)).join('; ')})`;
  }
}
