import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { ArchiveValidator, BackupError } from './backup-archive';
import { BackupStorage, StoredFile } from './backup-ports';

/** Directorio `STORAGE_DIR` en disco; las rutas se expresan relativas y con `/`. */
export class DiskBackupStorage extends BackupStorage {
  /** Subidas en curso (`ImportUploads`): temporales, no forman parte del respaldo. */
  private static readonly TRANSIENT: string = '.uploads/';

  private readonly root: string;

  public constructor(directory: string) {
    super();
    this.root = resolve(directory);
  }

  public override async paths(): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { recursive: true, withFileTypes: true });
      return entries
        .filter((entry): boolean => entry.isFile())
        .map((entry): string =>
          relative(this.root, resolve(entry.parentPath, entry.name)).split(sep).join('/'),
        )
        .filter((path: string): boolean => !path.startsWith(DiskBackupStorage.TRANSIENT));
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  public override read(path: string): Promise<Uint8Array> {
    return readFile(this.absolute(path));
  }

  public override async write(file: StoredFile): Promise<void> {
    const target: string = this.absolute(file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }

  /** Resuelve dentro de la raíz; rechaza cualquier ruta que intente salir de ella. */
  private absolute(path: string): string {
    ArchiveValidator.assertSafePath(path);
    const target: string = resolve(this.root, ...path.split('/'));
    if (!target.startsWith(`${this.root}${sep}`)) {
      throw new BackupError(`Ruta fuera del directorio de archivos: ${path}`);
    }
    return target;
  }
}
