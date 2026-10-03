import { TextLine } from './text-line';

/**
 * Divide texto en líneas de forma incremental, con las mismas reglas que `TextDocument`: quita el
 * BOM inicial, acepta `\r\n`, `\n` y `\r`, marca los saltos de página (`\f`) y expande tabulaciones.
 * Permite leer archivos de millones de líneas por bloques sin tenerlos completos en memoria.
 */
export class TextLineSplitter {
  private static readonly BREAK: RegExp = /\r\n|\n|\r/;

  private pending: string = '';
  private started: boolean = false;
  private nextNumber: number = 1;

  public constructor(private readonly tabSize: number) {}

  /** Agrega un bloque de texto y devuelve las líneas que quedaron completas. */
  public push(text: string): TextLine[] {
    let buffer: string = this.pending + text;
    if (!this.started && buffer.length > 0) {
      buffer = buffer.replace(/^\uFEFF/, '');
      this.started = true;
    }
    // Un `\r` al final puede ser la mitad de un `\r\n` que sigue en el próximo bloque.
    const heldReturn: boolean = buffer.endsWith('\r');
    const parts: string[] = (heldReturn ? buffer.slice(0, -1) : buffer).split(TextLineSplitter.BREAK);
    const partial: string = parts.pop() ?? '';
    this.pending = heldReturn ? `${partial}\r` : partial;
    return parts.map((raw: string): TextLine => this.line(raw));
  }

  /** Termina el texto: emite la última línea si no estaba vacía. */
  public finish(): TextLine[] {
    const parts: string[] = this.pending.split(TextLineSplitter.BREAK);
    this.pending = '';
    if (parts.length > 0 && parts[parts.length - 1] === '') {
      parts.pop();
    }
    return parts.map((raw: string): TextLine => this.line(raw));
  }

  private line(raw: string): TextLine {
    const pageBreak: boolean = raw.includes('\f');
    const line: TextLine = new TextLine(
      this.nextNumber,
      TextLineSplitter.expandTabs(raw.replace(/\f/g, ''), this.tabSize),
      pageBreak,
    );
    this.nextNumber += 1;
    return line;
  }

  public static expandTabs(line: string, tabSize: number): string {
    if (!line.includes('\t') || tabSize <= 0) {
      return line;
    }
    let result: string = '';
    for (const char of line) {
      result += char === '\t' ? ' '.repeat(tabSize - (result.length % tabSize)) : char;
    }
    return result;
  }
}

/** Decide la codificación por bloques: UTF-8 si todo el contenido es UTF-8 válido, si no Windows-1252. */
export class Utf8Probe {
  private readonly decoder: TextDecoder = new TextDecoder('utf-8', { fatal: true });
  private valid: boolean = true;

  public push(bytes: Uint8Array): void {
    if (!this.valid) {
      return;
    }
    try {
      this.decoder.decode(bytes, { stream: true });
    } catch {
      this.valid = false;
    }
  }

  public isValid(): boolean {
    if (this.valid) {
      try {
        this.decoder.decode();
      } catch {
        this.valid = false;
      }
    }
    return this.valid;
  }
}
