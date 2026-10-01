/** Línea de un archivo de texto (número 1-based); `pageBreak` indica que traía `\f`. */
export class TextLine {
  public constructor(
    public readonly number: number,
    public readonly text: string,
    public readonly pageBreak: boolean,
  ) {}

  public isBlank(): boolean {
    return this.text.trim().length === 0;
  }

  public charAt(position: number): string {
    return position >= 0 && position < this.text.length ? this.text.charAt(position) : ' ';
  }

  public slice(start: number, end: number): string {
    return this.text.slice(start, end);
  }
}
