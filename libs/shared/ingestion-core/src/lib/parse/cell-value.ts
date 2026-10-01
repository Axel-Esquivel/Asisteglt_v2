/**
 * Valor de una celda ya convertido: texto, número como decimal canónico en texto (nunca `number`),
 * fecha `AAAA-MM-DD`, sí/no como `boolean`, o `null` (sin valor).
 */
export type CellValue = string | boolean | null;

export type RecordValues = Readonly<Record<string, CellValue>>;
