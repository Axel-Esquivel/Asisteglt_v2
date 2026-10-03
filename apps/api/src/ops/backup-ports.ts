/** Documento de una colección ya serializado en EJSON canónico (conserva ObjectId, Date, Decimal128). */
export type EjsonDocument = string;

/** Definición de un índice secundario tal como la devuelve `listIndexes` (sin el `_id_`). */
export interface IndexDefinition {
  readonly name: string;
  readonly key: Readonly<Record<string, unknown>>;
  readonly options: Readonly<Record<string, unknown>>;
}

/** Acceso a la base que se respalda o restaura. */
export abstract class BackupDatabase {
  public abstract collections(): Promise<string[]>;

  public abstract count(collection: string): Promise<number>;

  public abstract indexes(collection: string): Promise<IndexDefinition[]>;

  public abstract documents(collection: string): AsyncIterable<EjsonDocument>;

  public abstract drop(collection: string): Promise<void>;

  /** Crea la colección si no existe (las vacías también forman parte del respaldo). */
  public abstract ensureCollection(collection: string): Promise<void>;

  public abstract insert(collection: string, documents: ReadonlyArray<EjsonDocument>): Promise<void>;

  public abstract createIndexes(collection: string, indexes: ReadonlyArray<IndexDefinition>): Promise<void>;

  public abstract close(): Promise<void>;
}

/** Archivo del almacenamiento (cargas, fotos) con ruta relativa a `STORAGE_DIR`. */
export class StoredFile {
  public constructor(
    public readonly path: string,
    public readonly content: Uint8Array,
  ) {}
}

/** Directorio de archivos cargados que acompaña a la base en el respaldo. */
export abstract class BackupStorage {
  public abstract paths(): Promise<string[]>;

  public abstract read(path: string): Promise<Uint8Array>;

  public abstract write(file: StoredFile): Promise<void>;
}
