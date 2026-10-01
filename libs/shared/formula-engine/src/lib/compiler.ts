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
import { Lexer, Token } from './lexer';
import { Parser } from './parser';
import { FormulaPrinter } from './printer';
import { FormulaContext, TypeChecker } from './type-checker';
import { ValueType } from './value-type';

/** Fórmula compilada: forma canónica (con claves), árbol, dependencias y tipo del resultado. */
export class CompiledFormula {
  public constructor(
    public readonly canonicalSource: string,
    public readonly root: Expression,
    public readonly fieldDependencies: ReadonlyArray<string>,
    public readonly resultType: ValueType,
    public readonly context: FormulaContext,
  ) {}
}

class DependencyCollector implements ExpressionVisitor<string[]> {
  public visitNumber(_node: NumberLiteral): string[] {
    return [];
  }

  public visitText(_node: TextLiteral): string[] {
    return [];
  }

  public visitBoolean(_node: BooleanLiteral): string[] {
    return [];
  }

  public visitField(node: FieldReference): string[] {
    return [node.key];
  }

  public visitUnary(node: UnaryExpression): string[] {
    return node.operand.accept(this);
  }

  public visitBinary(node: BinaryExpression): string[] {
    return [...node.left.accept(this), ...node.right.accept(this)];
  }

  public visitCall(node: FunctionCall): string[] {
    return node.args.flatMap((a: Expression): string[] => a.accept(this));
  }
}

/** Compila `=[Debe] - [Haber]` → `=[#f_6Pw4] - [#f_2Lm5]` verificando tipos (docs/12 §2.8.4). */
export class FormulaCompiler {
  private readonly lexer: Lexer = new Lexer();

  public compile(source: string, fields: FieldResolver, context: FormulaContext): Result<CompiledFormula> {
    return this.lexer
      .tokenize(source)
      .flatMap((tokens: Token[]): Result<Expression> => new Parser(fields).parse(tokens))
      .flatMap((root: Expression): Result<CompiledFormula> =>
        new TypeChecker(fields, context)
          .check(root)
          .map(
            (type: ValueType): CompiledFormula =>
              new CompiledFormula(
                FormulaPrinter.canonical().print(root),
                root,
                [...new Set(root.accept(new DependencyCollector()))],
                type,
                context,
              ),
          ),
      );
  }
}

/** Muestra una fórmula guardada con los nombres vigentes (aunque un encabezado esté inactivo). */
export class FormulaFormatter {
  public format(canonical: string, fields: FieldResolver): string {
    const permissive: FieldResolver = new PermissiveResolver(fields);
    return new Lexer()
      .tokenize(canonical)
      .flatMap((tokens: Token[]): Result<Expression> => new Parser(permissive).parse(tokens))
      .match(
        (root: Expression): string => FormulaPrinter.display(fields).print(root),
        (): string => canonical,
      );
  }
}

class PermissiveResolver extends FieldResolver {
  public constructor(private readonly inner: FieldResolver) {
    super();
  }

  public override findByLabel(label: string): Nullable<FieldInfo> {
    return PermissiveResolver.active(this.inner.findByLabel(label));
  }

  public override find(key: string): Nullable<FieldInfo> {
    return PermissiveResolver.active(this.inner.find(key));
  }

  private static active(field: Nullable<FieldInfo>): Nullable<FieldInfo> {
    return field === null
      ? null
      : new FieldInfo(
          field.key,
          field.label,
          field.dataType,
          field.nature,
          field.aggregation,
          field.weightKey,
          true,
        );
  }
}
