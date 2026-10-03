import { createHash, Hash } from 'node:crypto';
import { Nullable } from '@asisteglt/shared-kernel';
import { IndexDefinition } from './backup-ports';

/**
 * Formato del respaldo: líneas JSON (una por registro) comprimidas con gzip y, si hay frase de
 * paso, cifradas. La primera línea es la cabecera, la última el cierre con conteos y SHA-256 de
 * todas las anteriores, de modo que un archivo truncado o alterado se detecta antes de restaurar.
 */
export class BackupFormat {
  public static readonly NAME = 'asisteglt.backup' as const;
  public static readonly VERSION: number = 1;
}

export interface HeaderLine {
  readonly kind: 'header';
  readonly format: string;
  readonly version: number;
  readonly createdAt: string;
  readonly database: string;
}

export interface CollectionLine {
  readonly kind: 'collection';
  readonly name: string;
  readonly indexes: ReadonlyArray<IndexDefinition>;
}

export interface DocumentLine {
  readonly kind: 'document';
  readonly collection: string;
  readonly ejson: string;
}

export interface FileLine {
  readonly kind: 'file';
  readonly path: string;
  readonly base64: string;
}

export interface EndLine {
  readonly kind: 'end';
  readonly documents: Readonly<Record<string, number>>;
  readonly files: number;
  readonly sha256: string;
}

export type ArchiveLine = HeaderLine | CollectionLine | DocumentLine | FileLine | EndLine;

/** Escribe líneas y acumula el resumen que va en el cierre. */
export class ArchiveWriter {
  private readonly hash: Hash = createHash('sha256');
  private readonly documents: Map<string, number> = new Map<string, number>();
  private files: number = 0;

  public line(line: Exclude<ArchiveLine, EndLine>): string {
    if (line.kind === 'document') {
      this.documents.set(line.collection, (this.documents.get(line.collection) ?? 0) + 1);
    }
    if (line.kind === 'collection' && !this.documents.has(line.name)) {
      this.documents.set(line.name, 0);
    }
    if (line.kind === 'file') {
      this.files += 1;
    }
    const text: string = `${JSON.stringify(line)}\n`;
    this.hash.update(text);
    return text;
  }

  public end(): string {
    const end: EndLine = {
      kind: 'end',
      documents: Object.fromEntries(this.documents),
      files: this.files,
      sha256: this.hash.digest('hex'),
    };
    return `${JSON.stringify(end)}\n`;
  }
}

/** Resultado de comprobar un respaldo completo. */
export class ArchiveSummary {
  public constructor(
    public readonly header: HeaderLine,
    public readonly documents: Readonly<Record<string, number>>,
    public readonly files: number,
  ) {}

  public collections(): string[] {
    return Object.keys(this.documents);
  }

  public totalDocuments(): number {
    return Object.values(this.documents).reduce((sum: number, count: number): number => sum + count, 0);
  }
}

/** Valida las líneas en orden: cabecera conocida, tipos correctos, conteos y suma de verificación. */
export class ArchiveValidator {
  private readonly hash: Hash = createHash('sha256');
  private readonly documents: Map<string, number> = new Map<string, number>();
  private header: Nullable<HeaderLine> = null;
  private summary: Nullable<ArchiveSummary> = null;
  private files: number = 0;

  /** Interpreta y valida una línea; lanza `BackupError` si algo no cuadra. */
  public accept(text: string): ArchiveLine {
    if (this.summary !== null) {
      throw new BackupError('Hay contenido después del cierre del respaldo');
    }
    const line: ArchiveLine = ArchiveValidator.parse(text);
    if (line.kind === 'end') {
      this.close(line);
      return line;
    }
    this.hash.update(`${text}\n`);
    if (this.header === null) {
      if (line.kind !== 'header' || line.format !== BackupFormat.NAME) {
        throw new BackupError('El archivo no es un respaldo de AsisteGLT');
      }
      if (line.version !== BackupFormat.VERSION) {
        throw new BackupError(`Versión de respaldo no soportada: ${String(line.version)}`);
      }
      this.header = line;
      return line;
    }
    if (line.kind === 'header') {
      throw new BackupError('Cabecera repetida');
    }
    if (line.kind === 'collection') {
      this.documents.set(line.name, this.documents.get(line.name) ?? 0);
    }
    if (line.kind === 'document') {
      if (!this.documents.has(line.collection)) {
        throw new BackupError(`Documento de una colección no declarada: ${line.collection}`);
      }
      this.documents.set(line.collection, (this.documents.get(line.collection) ?? 0) + 1);
    }
    if (line.kind === 'file') {
      ArchiveValidator.assertSafePath(line.path);
      this.files += 1;
    }
    return line;
  }

  /** Resumen verificado; lanza si el archivo terminó sin cierre (truncado). */
  public result(): ArchiveSummary {
    if (this.summary === null) {
      throw new BackupError('El respaldo está incompleto (falta el cierre)');
    }
    return this.summary;
  }

  private close(end: EndLine): void {
    if (this.header === null) {
      throw new BackupError('El respaldo no tiene cabecera');
    }
    if (end.sha256 !== this.hash.digest('hex')) {
      throw new BackupError('La suma de verificación no coincide: el respaldo está dañado o fue alterado');
    }
    const counted: Record<string, number> = Object.fromEntries(this.documents);
    if (
      JSON.stringify(ArchiveValidator.sorted(counted)) !==
      JSON.stringify(ArchiveValidator.sorted(end.documents))
    ) {
      throw new BackupError('Los conteos de documentos no coinciden con el cierre');
    }
    if (end.files !== this.files) {
      throw new BackupError('El número de archivos no coincide con el cierre');
    }
    this.summary = new ArchiveSummary(this.header, counted, this.files);
  }

  /** Rutas relativas sin `..` ni absolutas: un respaldo no puede escribir fuera de `STORAGE_DIR`. */
  public static assertSafePath(path: string): void {
    const parts: string[] = path.split('/');
    if (
      path === '' ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('\0') ||
      parts.some((part: string): boolean => part === '' || part === '.' || part === '..')
    ) {
      throw new BackupError(`Ruta de archivo no permitida en el respaldo: ${path}`);
    }
  }

  private static sorted(record: Readonly<Record<string, number>>): Array<[string, number]> {
    return Object.entries(record).sort(([a]: [string, number], [b]: [string, number]): number =>
      a.localeCompare(b),
    );
  }

  /** Interpreta una línea sin validar el orden (la segunda pasada de la restauración). */
  public static parse(text: string): ArchiveLine {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new BackupError('Línea ilegible en el respaldo');
    }
    if (typeof value !== 'object' || value === null || !('kind' in value)) {
      throw new BackupError('Línea sin tipo en el respaldo');
    }
    const record: Readonly<Record<string, unknown>> = Object.fromEntries(Object.entries(value));
    const stringField = (name: string): string => {
      const field: unknown = record[name];
      if (typeof field !== 'string') {
        throw new BackupError(`Campo «${name}» inválido en el respaldo`);
      }
      return field;
    };
    const integerField = (name: string): number => {
      const field: unknown = record[name];
      if (typeof field !== 'number' || !Number.isInteger(field) || field < 0) {
        throw new BackupError(`Campo «${name}» inválido en el respaldo`);
      }
      return field;
    };
    switch (record['kind']) {
      case 'header':
        return {
          kind: 'header',
          format: stringField('format'),
          version: integerField('version'),
          createdAt: stringField('createdAt'),
          database: stringField('database'),
        };
      case 'collection':
        return {
          kind: 'collection',
          name: stringField('name'),
          indexes: ArchiveValidator.indexes(record['indexes']),
        };
      case 'document':
        return { kind: 'document', collection: stringField('collection'), ejson: stringField('ejson') };
      case 'file':
        return { kind: 'file', path: stringField('path'), base64: stringField('base64') };
      case 'end':
        return {
          kind: 'end',
          documents: ArchiveValidator.counts(record['documents']),
          files: integerField('files'),
          sha256: stringField('sha256'),
        };
      default:
        throw new BackupError('Tipo de línea desconocido en el respaldo');
    }
  }

  private static counts(value: unknown): Readonly<Record<string, number>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BackupError('Conteos inválidos en el cierre');
    }
    const counts: Record<string, number> = {};
    for (const [name, count] of Object.entries(value)) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        throw new BackupError('Conteos inválidos en el cierre');
      }
      counts[name] = count;
    }
    return counts;
  }

  private static indexes(value: unknown): IndexDefinition[] {
    if (!Array.isArray(value)) {
      throw new BackupError('Índices inválidos en el respaldo');
    }
    return value.map((item: unknown): IndexDefinition => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('name' in item) ||
        typeof item.name !== 'string' ||
        !('key' in item) ||
        typeof item.key !== 'object' ||
        item.key === null ||
        !('options' in item) ||
        typeof item.options !== 'object' ||
        item.options === null
      ) {
        throw new BackupError('Índice inválido en el respaldo');
      }
      return {
        name: item.name,
        key: Object.fromEntries(Object.entries(item.key)),
        options: Object.fromEntries(Object.entries(item.options)),
      };
    });
  }
}

/** Error de respaldo o restauración con mensaje para el operador. */
export class BackupError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}
