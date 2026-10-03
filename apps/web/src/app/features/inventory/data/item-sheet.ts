import { InventoryItemRequest } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';

export interface ItemMapping {
  sku: Nullable<number>;
  description: Nullable<number>;
  unit: Nullable<number>;
  location: Nullable<number>;
  quantity: Nullable<number>;
  cost: Nullable<number>;
  x: Nullable<number>;
  y: Nullable<number>;
}

/**
 * Archivo de ítems delimitado (CSV / punto y coma / tabulador) leído en el navegador. La primera
 * fila son los títulos; el usuario indica qué columna corresponde a cada papel.
 */
export class ItemSheet {
  private constructor(
    public readonly headers: string[],
    public readonly rows: string[][],
  ) {}

  public static parse(text: string): ItemSheet {
    const lines: string[] = text
      .replace(/^\uFEFF/, '')
      .split(/\r\n|\n|\r/)
      .filter((l: string): boolean => l.trim().length > 0);
    const first: string = lines[0] ?? '';
    const delimiter: string = [';', '\t', ','].reduce(
      (best: string, d: string): string => (first.split(d).length > first.split(best).length ? d : best),
      ',',
    );
    const split = (line: string): string[] => ItemSheet.splitLine(line, delimiter);
    return new ItemSheet(split(first), lines.slice(1).map(split));
  }

  /** Propone el mapeo buscando títulos conocidos. */
  public guess(): ItemMapping {
    const find = (...names: string[]): Nullable<number> => {
      const index: number = this.headers.findIndex((h: string): boolean =>
        names.some((n: string): boolean => h.toLowerCase().includes(n)),
      );
      return index < 0 ? null : index;
    };
    return {
      sku: find('sku', 'código', 'codigo'),
      description: find('descrip', 'nombre'),
      unit: find('unidad', 'unit'),
      location: find('ubic', 'locat'),
      quantity: find('cant', 'exist', 'qty'),
      cost: find('costo', 'cost'),
      x: this.exact('x', 'coord x', 'coordenada x'),
      y: this.exact('y', 'coord y', 'coordenada y'),
    };
  }

  public items(mapping: ItemMapping): InventoryItemRequest[] {
    const cell = (row: string[], index: Nullable<number>): string =>
      index === null ? '' : (row[index] ?? '').trim();
    return this.rows.map((row: string[]): InventoryItemRequest => ({
      sku: cell(row, mapping.sku),
      description: cell(row, mapping.description),
      unit: cell(row, mapping.unit),
      location: cell(row, mapping.location),
      expectedQuantity: cell(row, mapping.quantity),
      unitCost: mapping.cost === null || cell(row, mapping.cost) === '' ? null : cell(row, mapping.cost),
      x: mapping.x === null || cell(row, mapping.x) === '' ? null : cell(row, mapping.x),
      y: mapping.y === null || cell(row, mapping.y) === '' ? null : cell(row, mapping.y),
    }));
  }

  /** Columna cuyo título es exactamente uno de los nombres (sin distinguir mayúsculas). */
  private exact(...names: string[]): Nullable<number> {
    const index: number = this.headers.findIndex((h: string): boolean =>
      names.includes(h.trim().toLowerCase()),
    );
    return index < 0 ? null : index;
  }

  private static splitLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current: string = '';
    let quoted: boolean = false;
    for (let i = 0; i < line.length; i += 1) {
      const char: string = line.charAt(i);
      if (char === '"' && quoted && line.charAt(i + 1) === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map((c: string): string => c.trim());
  }
}
