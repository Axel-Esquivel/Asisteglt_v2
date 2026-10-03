import { TextDocument, TextEncoding } from './text-document';
import { TextLine } from './text-line';
import { TextLineSplitter, Utf8Probe } from './text-line-splitter';

function chunked(text: string, size: number): TextLine[] {
  const splitter: TextLineSplitter = new TextLineSplitter(8);
  const lines: TextLine[] = [];
  for (let start = 0; start < text.length; start += size) {
    lines.push(...splitter.push(text.slice(start, start + size)));
  }
  return [...lines, ...splitter.finish()];
}

describe('TextLineSplitter', () => {
  const samples: ReadonlyArray<string> = [
    '﻿uno\r\ndos\rtres\ncuatro',
    'a\r\n\r\nb\r\n',
    'x\r',
    '\fPÁGINA\t2\ncol1\tcol2\n\n',
    '',
    '\r\n\r\n',
  ];

  it('produce las mismas líneas que TextDocument con cualquier tamaño de bloque', (): void => {
    for (const sample of samples) {
      const expected: ReadonlyArray<TextLine> = TextDocument.fromText(sample, TextEncoding.UTF8, 8).all();
      for (const size of [1, 2, 3, 7, 1000]) {
        expect(chunked(sample, size)).toEqual(expected);
      }
    }
  });

  it('numera, marca saltos de página y expande tabulaciones', (): void => {
    const lines: TextLine[] = chunked('\fA\tB\nC', 2);
    expect(lines).toEqual([new TextLine(1, 'A       B', true), new TextLine(2, 'C', false)]);
  });
});

describe('Utf8Probe', () => {
  it('detecta UTF-8 válido aunque un carácter quede partido entre bloques', (): void => {
    const bytes: Uint8Array = new TextEncoder().encode('añoñ');
    const probe: Utf8Probe = new Utf8Probe();
    probe.push(bytes.subarray(0, 2));
    probe.push(bytes.subarray(2));
    expect(probe.isValid()).toBe(true);
  });

  it('marca inválido un contenido Windows-1252 y uno truncado', (): void => {
    const latin: Utf8Probe = new Utf8Probe();
    latin.push(new Uint8Array([0x61, 0xf1, 0x6f]));
    expect(latin.isValid()).toBe(false);
    const truncated: Utf8Probe = new Utf8Probe();
    truncated.push(new Uint8Array([0x61, 0xc3]));
    expect(truncated.isValid()).toBe(false);
  });
});
