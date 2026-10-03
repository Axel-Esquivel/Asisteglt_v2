import { Clock, Nullable } from '@asisteglt/shared-kernel';
import {
  ArchiveLine,
  ArchiveSummary,
  ArchiveValidator,
  ArchiveWriter,
  BackupError,
  BackupFormat,
} from './backup-archive';
import { BackupEnvelope } from './backup-envelope';
import { BackupDatabase, BackupStorage, EjsonDocument, IndexDefinition, StoredFile } from './backup-ports';

/** Qué hacer si el destino ya tiene datos: abortar (por defecto) o reemplazarlos. */
export enum RestoreMode {
  SAFE = 'SAFE',
  REPLACE = 'REPLACE',
}

/**
 * Respaldo y restauración de la base y del almacenamiento de archivos en un solo archivo.
 * Restaurar es en dos pasadas: primero se verifica el archivo completo (cifrado, suma y conteos) y
 * que el destino no tenga datos que se perderían; solo después se escribe.
 */
export class BackupService {
  public constructor(
    private readonly database: BackupDatabase,
    private readonly storage: BackupStorage,
    private readonly clock: Clock,
  ) {}

  public async create(
    path: string,
    databaseName: string,
    passphrase: Nullable<string>,
  ): Promise<ArchiveSummary> {
    await BackupEnvelope.write(path, this.lines(databaseName), passphrase);
    return this.verify(path, passphrase);
  }

  public async verify(path: string, passphrase: Nullable<string>): Promise<ArchiveSummary> {
    const validator: ArchiveValidator = new ArchiveValidator();
    await BackupEnvelope.read(path, passphrase, (line: string): Promise<void> => {
      validator.accept(line);
      return Promise.resolve();
    });
    return validator.result();
  }

  public async restore(
    path: string,
    passphrase: Nullable<string>,
    mode: RestoreMode,
  ): Promise<ArchiveSummary> {
    const summary: ArchiveSummary = await this.verify(path, passphrase);
    if (mode === RestoreMode.SAFE) {
      await this.assertEmptyTarget(summary);
    }
    const restorer: CollectionRestorer = new CollectionRestorer(this.database, this.storage, mode);
    await BackupEnvelope.read(path, passphrase, (line: string): Promise<void> =>
      restorer.apply(ArchiveValidator.parse(line)),
    );
    await restorer.finish();
    return summary;
  }

  private async assertEmptyTarget(summary: ArchiveSummary): Promise<void> {
    const occupied: string[] = [];
    const existing: ReadonlySet<string> = new Set<string>(await this.database.collections());
    for (const name of summary.collections()) {
      if (existing.has(name) && (await this.database.count(name)) > 0) {
        occupied.push(name);
      }
    }
    if (occupied.length > 0) {
      throw new BackupError(
        `El destino ya tiene datos en: ${occupied.join(', ')}. Usa --reemplazar para sobrescribirlos.`,
      );
    }
    if ((await this.storage.paths()).length > 0 && summary.files > 0) {
      throw new BackupError('El directorio de archivos no está vacío. Usa --reemplazar para sobrescribirlo.');
    }
  }

  private async *lines(databaseName: string): AsyncGenerator<string> {
    const writer: ArchiveWriter = new ArchiveWriter();
    yield writer.line({
      kind: 'header',
      format: BackupFormat.NAME,
      version: BackupFormat.VERSION,
      createdAt: this.clock.now().toISOString(),
      database: databaseName,
    });
    const names: string[] = (await this.database.collections()).sort();
    for (const name of names) {
      yield writer.line({ kind: 'collection', name, indexes: await this.database.indexes(name) });
      for await (const ejson of this.database.documents(name)) {
        yield writer.line({ kind: 'document', collection: name, ejson });
      }
    }
    for (const path of (await this.storage.paths()).sort()) {
      const content: Uint8Array = await this.storage.read(path);
      yield writer.line({ kind: 'file', path, base64: Buffer.from(content).toString('base64') });
    }
    yield writer.end();
  }
}

/** Escribe colección por colección en lotes y crea los índices al terminar cada una. */
class CollectionRestorer {
  private static readonly INSERT_BATCH: number = 500;

  private current: Nullable<string> = null;
  private indexes: ReadonlyArray<IndexDefinition> = [];
  private batch: EjsonDocument[] = [];

  public constructor(
    private readonly database: BackupDatabase,
    private readonly storage: BackupStorage,
    private readonly mode: RestoreMode,
  ) {}

  public async apply(line: ArchiveLine): Promise<void> {
    switch (line.kind) {
      case 'collection':
        await this.finish();
        this.current = line.name;
        this.indexes = line.indexes;
        if (this.mode === RestoreMode.REPLACE) {
          await this.database.drop(line.name);
        }
        await this.database.ensureCollection(line.name);
        return;
      case 'document':
        this.batch.push(line.ejson);
        if (this.batch.length >= CollectionRestorer.INSERT_BATCH) {
          await this.flush();
        }
        return;
      case 'file':
        await this.finish();
        await this.storage.write(new StoredFile(line.path, Buffer.from(line.base64, 'base64')));
        return;
      case 'header':
      case 'end':
        return;
    }
  }

  /** Inserta lo pendiente de la colección en curso y crea sus índices. */
  public async finish(): Promise<void> {
    await this.flush();
    if (this.current !== null && this.indexes.length > 0) {
      await this.database.createIndexes(this.current, this.indexes);
    }
    this.current = null;
    this.indexes = [];
  }

  private async flush(): Promise<void> {
    if (this.current === null || this.batch.length === 0) {
      return;
    }
    const documents: EjsonDocument[] = this.batch;
    this.batch = [];
    await this.database.insert(this.current, documents);
  }
}
