import { TextLine } from './text-line';

export enum TextEncoding {
  UTF8 = 'utf-8',
  WINDOWS_1252 = 'windows-1252',
  ISO_8859_1 = 'iso-8859-1',
}

/**
 * Documento de texto ya decodificado y dividido en líneas. Se usa igual en el navegador
 * (archivo de muestra) y en el servidor (importación real).
 */
export class TextDocument {
  private constructor(
    private readonly lines: ReadonlyArray<TextLine>,
    public readonly encoding: TextEncoding,
  ) {}

  /** UTF-8 válido → UTF-8; si no, Windows-1252 (habitual en reportes "impresos a archivo"). */
  public static detectEncoding(bytes: Uint8Array): TextEncoding {
    try {
      new TextDecoder(TextEncoding.UTF8, { fatal: true }).decode(bytes);
      return TextEncoding.UTF8;
    } catch {
      return TextEncoding.WINDOWS_1252;
    }
  }

  public static decode(bytes: Uint8Array, encoding: TextEncoding, tabSize: number): TextDocument {
    const text: string = new TextDecoder(encoding).decode(bytes);
    return TextDocument.fromText(text, encoding, tabSize);
  }

  public static fromText(text: string, encoding: TextEncoding, tabSize: number): TextDocument {
    const raw: string[] = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    if (raw.length > 0 && raw[raw.length - 1] === '') {
      raw.pop();
    }
    const lines: TextLine[] = raw.map((line: string, index: number): TextLine => {
      const pageBreak: boolean = line.includes('\f');
      return new TextLine(index + 1, TextDocument.expandTabs(line.replace(/\f/g, ''), tabSize), pageBreak);
    });
    return new TextDocument(lines, encoding);
  }

  private static expandTabs(line: string, tabSize: number): string {
    if (!line.includes('\t') || tabSize <= 0) {
      return line;
    }
    let result: string = '';
    for (const char of line) {
      result += char === '\t' ? ' '.repeat(tabSize - (result.length % tabSize)) : char;
    }
    return result;
  }

  public all(): ReadonlyArray<TextLine> {
    return this.lines;
  }

  public count(): number {
    return this.lines.length;
  }

  public maxLineLength(): number {
    return this.lines.reduce((max: number, line: TextLine): number => Math.max(max, line.text.length), 0);
  }

  public pageBreaks(): number {
    return this.lines.filter((line: TextLine): boolean => line.pageBreak).length;
  }

  public replacementChars(): number {
    return this.lines.reduce(
      (sum: number, line: TextLine): number => sum + (line.text.match(/�/g) ?? []).length,
      0,
    );
  }

  public head(count: number): TextDocument {
    return new TextDocument(this.lines.slice(0, count), this.encoding);
  }
}
