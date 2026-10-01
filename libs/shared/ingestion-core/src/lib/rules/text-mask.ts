/**
 * Máscara de texto: `9` dígito, `A` letra, `X` letra o dígito, `*` cualquier carácter; el resto
 * son literales. Se compara contra el valor ya recortado.
 */
export class TextMask {
  private static readonly LETTER: RegExp = /\p{L}/u;
  private static readonly DIGIT: RegExp = /\p{Nd}/u;

  private constructor(public readonly pattern: string) {}

  public static of(pattern: string): TextMask {
    return new TextMask(pattern);
  }

  /** Propone una máscara a partir de un valor de ejemplo (`1.001.002.0000` → `9.999.999.9999`). */
  public static fromSample(value: string): TextMask {
    let pattern: string = '';
    for (const char of value.trim()) {
      pattern += TextMask.DIGIT.test(char) ? '9' : TextMask.LETTER.test(char) ? 'A' : char;
    }
    return new TextMask(pattern);
  }

  public matches(value: string): boolean {
    const chars: string[] = [...value];
    const tokens: string[] = [...this.pattern];
    if (chars.length !== tokens.length) {
      return false;
    }
    return tokens.every((token: string, index: number): boolean => {
      const char: string = chars[index] ?? '';
      switch (token) {
        case '9':
          return TextMask.DIGIT.test(char);
        case 'A':
          return TextMask.LETTER.test(char);
        case 'X':
          return TextMask.DIGIT.test(char) || TextMask.LETTER.test(char);
        case '*':
          return true;
        default:
          return token === char;
      }
    });
  }
}

/**
 * Firma tolerante de una línea de encabezado de página: espacios colapsados y cada grupo de
 * dígitos reemplazado por `#`, para que fecha, hora y número de página puedan variar.
 */
export class LineSignature {
  public static of(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\p{Nd}+/gu, '#');
  }
}
