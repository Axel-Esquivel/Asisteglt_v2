import { Decimal, Nullable, Result } from '@asisteglt/shared-kernel';
import {
  BinaryExpression,
  BinaryOperator,
  BooleanLiteral,
  Expression,
  FieldReference,
  FunctionCall,
  NumberLiteral,
  TextLiteral,
  UnaryExpression,
} from './ast';
import { FieldInfo, FieldResolver } from './field-resolver';
import { FormulaError, FormulaErrorCode } from './formula-errors';
import { Token, TokenType } from './lexer';

class ParseFailure extends Error {
  public constructor(public readonly error: FormulaError) {
    super(error.message);
  }
}

/**
 * Analizador descendente con precedencias. Los nombres de encabezado se resuelven a su clave
 * aquí mismo, así el árbol nunca contiene nombres.
 */
export class Parser {
  private static readonly COMPARISONS: ReadonlyArray<BinaryOperator> = ['=', '<>', '<', '>', '<=', '>='];
  private tokens: ReadonlyArray<Token> = [];
  private cursor: number = 0;

  public constructor(private readonly fields: FieldResolver) {}

  public parse(tokens: ReadonlyArray<Token>): Result<Expression> {
    this.tokens = tokens;
    this.cursor = 0;
    try {
      const expression: Expression = this.comparison();
      if (this.peek().type !== TokenType.END) {
        throw Parser.failure(`Sobra «${this.peek().lexeme}»`, this.peek().position);
      }
      return Result.ok(expression);
    } catch (error: unknown) {
      if (error instanceof ParseFailure) {
        return Result.fail(error.error);
      }
      throw error;
    }
  }

  private comparison(): Expression {
    let left: Expression = this.concatenation();
    const token: Token = this.peek();
    const operator: Nullable<BinaryOperator> =
      token.type === TokenType.OPERATOR
        ? (Parser.COMPARISONS.find((op: BinaryOperator): boolean => op === token.lexeme) ?? null)
        : null;
    if (operator !== null) {
      this.advance();
      left = new BinaryExpression(operator, left, this.concatenation(), token.position);
    }
    return left;
  }

  private concatenation(): Expression {
    let left: Expression = this.additive();
    while (this.matches('&')) {
      const token: Token = this.advance();
      left = new BinaryExpression('&', left, this.additive(), token.position);
    }
    return left;
  }

  private additive(): Expression {
    let left: Expression = this.multiplicative();
    while (this.matches('+') || this.matches('-')) {
      const token: Token = this.advance();
      left = new BinaryExpression(
        token.lexeme === '+' ? '+' : '-',
        left,
        this.multiplicative(),
        token.position,
      );
    }
    return left;
  }

  private multiplicative(): Expression {
    let left: Expression = this.unary();
    while (this.matches('*') || this.matches('/')) {
      const token: Token = this.advance();
      left = new BinaryExpression(token.lexeme === '*' ? '*' : '/', left, this.unary(), token.position);
    }
    return left;
  }

  private unary(): Expression {
    if (this.matches('-')) {
      const token: Token = this.advance();
      return new UnaryExpression('-', this.unary(), token.position);
    }
    if (this.matches('+')) {
      this.advance();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): Expression {
    const token: Token = this.advance();
    switch (token.type) {
      case TokenType.NUMBER:
        return new NumberLiteral(
          Decimal.of(token.lexeme.startsWith('.') ? `0${token.lexeme}` : token.lexeme).unwrap(),
          token.position,
        );
      case TokenType.TEXT:
        return new TextLiteral(token.lexeme, token.position);
      case TokenType.FIELD:
        return this.field(token);
      case TokenType.IDENTIFIER:
        return this.identifier(token);
      case TokenType.LEFT_PAREN: {
        const inner: Expression = this.comparison();
        this.expect(TokenType.RIGHT_PAREN, 'Falta el paréntesis de cierre «)»');
        return inner;
      }
      case TokenType.END:
        throw Parser.failure('La fórmula está incompleta', token.position);
      case TokenType.OPERATOR:
      case TokenType.RIGHT_PAREN:
      case TokenType.SEPARATOR:
        throw Parser.failure(`No se esperaba «${token.lexeme}»`, token.position);
    }
  }

  private field(token: Token): Expression {
    const name: string = token.lexeme.trim();
    const field: Nullable<FieldInfo> = name.startsWith('#')
      ? this.fields.find(name.slice(1))
      : this.fields.findByLabel(name);
    if (field === null) {
      throw new ParseFailure(
        new FormulaError(FormulaErrorCode.UNKNOWN_FIELD, `No existe el encabezado [${name}]`, token.position),
      );
    }
    if (!field.active) {
      throw new ParseFailure(
        new FormulaError(
          FormulaErrorCode.FIELD_INACTIVE,
          `«${field.label} (inactivo)» está desactivado; elija otro encabezado`,
          token.position,
        ),
      );
    }
    return new FieldReference(field.key, token.position);
  }

  private identifier(token: Token): Expression {
    if (this.peek().type !== TokenType.LEFT_PAREN) {
      if (token.lexeme === 'VERDADERO' || token.lexeme === 'FALSO') {
        return new BooleanLiteral(token.lexeme === 'VERDADERO', token.position);
      }
      throw Parser.failure(
        `«${token.lexeme}» no es una función; los encabezados se escriben entre corchetes: [${token.lexeme}]`,
        token.position,
      );
    }
    this.advance();
    const args: Expression[] = [];
    if (this.peek().type !== TokenType.RIGHT_PAREN) {
      args.push(this.comparison());
      while (this.peek().type === TokenType.SEPARATOR) {
        this.advance();
        args.push(this.comparison());
      }
    }
    this.expect(TokenType.RIGHT_PAREN, `Falta «)» al final de ${token.lexeme}(`);
    return new FunctionCall(token.lexeme, args, token.position);
  }

  private matches(operator: string): boolean {
    const token: Token = this.peek();
    return token.type === TokenType.OPERATOR && token.lexeme === operator;
  }

  private expect(type: TokenType, message: string): void {
    if (this.peek().type !== type) {
      throw Parser.failure(message, this.peek().position);
    }
    this.advance();
  }

  private peek(): Token {
    return this.tokens[this.cursor] ?? new Token(TokenType.END, '', 0);
  }

  private advance(): Token {
    const token: Token = this.peek();
    this.cursor = Math.min(this.cursor + 1, this.tokens.length);
    return token;
  }

  private static failure(message: string, position: number): ParseFailure {
    return new ParseFailure(new FormulaError(FormulaErrorCode.SYNTAX_ERROR, message, position));
  }
}
