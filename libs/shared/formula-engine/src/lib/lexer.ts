import { Result } from '@asisteglt/shared-kernel';
import { FormulaError, FormulaErrorCode } from './formula-errors';

export enum TokenType {
  NUMBER = 'NUMBER',
  TEXT = 'TEXT',
  FIELD = 'FIELD',
  IDENTIFIER = 'IDENTIFIER',
  OPERATOR = 'OPERATOR',
  LEFT_PAREN = 'LEFT_PAREN',
  RIGHT_PAREN = 'RIGHT_PAREN',
  SEPARATOR = 'SEPARATOR',
  END = 'END',
}

export class Token {
  public constructor(
    public readonly type: TokenType,
    public readonly lexeme: string,
    public readonly position: number,
  ) {}
}

/**
 * Convierte el texto en tokens. Encabezados entre corchetes (`[Debe]`, o `[#f_6Pw4]` en forma
 * canónica), textos entre comillas, números con punto decimal y argumentos separados por `;` o `,`.
 */
export class Lexer {
  private static readonly OPERATORS: ReadonlyArray<string> = [
    '<=',
    '>=',
    '<>',
    '+',
    '-',
    '*',
    '/',
    '=',
    '<',
    '>',
    '&',
  ];

  public tokenize(source: string): Result<Token[]> {
    const tokens: Token[] = [];
    const text: string = source.trim().startsWith('=') ? source.trim().slice(1) : source.trim();
    const offset: number =
      source.length - source.trimStart().length + (source.trim().startsWith('=') ? 1 : 0);
    let i: number = 0;
    while (i < text.length) {
      const char: string = text.charAt(i);
      const position: number = offset + i;
      if (/\s/.test(char)) {
        i += 1;
      } else if (char === '[') {
        const end: number = text.indexOf(']', i + 1);
        if (end < 0) {
          return Lexer.fail('Falta el corchete de cierre «]»', position);
        }
        tokens.push(new Token(TokenType.FIELD, text.slice(i + 1, end), position));
        i = end + 1;
      } else if (char === '"') {
        let end: number = i + 1;
        let value: string = '';
        while (end < text.length) {
          if (text.charAt(end) === '"' && text.charAt(end + 1) === '"') {
            value += '"';
            end += 2;
          } else if (text.charAt(end) === '"') {
            break;
          } else {
            value += text.charAt(end);
            end += 1;
          }
        }
        if (end >= text.length) {
          return Lexer.fail('Falta la comilla de cierre', position);
        }
        tokens.push(new Token(TokenType.TEXT, value, position));
        i = end + 1;
      } else if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(text.charAt(i + 1)))) {
        const match: RegExpExecArray | null = /^\d*\.?\d+|^\d+\.?/.exec(text.slice(i));
        const lexeme: string = match === null ? char : match[0];
        tokens.push(new Token(TokenType.NUMBER, lexeme, position));
        i += lexeme.length;
      } else if (/\p{L}|_/u.test(char)) {
        const match: RegExpExecArray | null = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(text.slice(i));
        const lexeme: string = match === null ? char : match[0];
        tokens.push(new Token(TokenType.IDENTIFIER, lexeme.toUpperCase(), position));
        i += lexeme.length;
      } else if (char === '(') {
        tokens.push(new Token(TokenType.LEFT_PAREN, char, position));
        i += 1;
      } else if (char === ')') {
        tokens.push(new Token(TokenType.RIGHT_PAREN, char, position));
        i += 1;
      } else if (char === ';' || char === ',') {
        tokens.push(new Token(TokenType.SEPARATOR, char, position));
        i += 1;
      } else {
        const operator: string | null =
          Lexer.OPERATORS.find((op: string): boolean => text.startsWith(op, i)) ?? null;
        if (operator === null) {
          return Lexer.fail(`Carácter no válido «${char}»`, position);
        }
        tokens.push(new Token(TokenType.OPERATOR, operator, position));
        i += operator.length;
      }
    }
    tokens.push(new Token(TokenType.END, '', offset + text.length));
    return Result.ok(tokens);
  }

  private static fail(message: string, position: number): Result<Token[]> {
    return Result.fail(new FormulaError(FormulaErrorCode.SYNTAX_ERROR, message, position));
  }
}
