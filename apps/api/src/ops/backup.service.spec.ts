import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixedClock } from '@asisteglt/shared-kernel';
import { ArchiveSummary, BackupError } from './backup-archive';
import { BackupDatabase, EjsonDocument, IndexDefinition } from './backup-ports';
import { BackupService, RestoreMode } from './backup.service';
import { DiskBackupStorage } from './disk-backup-storage';

/** Base en memoria con documentos ya en EJSON (datos ficticios). */
class MemoryBackupDatabase extends BackupDatabase {
  public readonly data: Map<string, EjsonDocument[]> = new Map<string, EjsonDocument[]>();
  public readonly indexDefinitions: Map<string, IndexDefinition[]> = new Map<string, IndexDefinition[]>();

  public override collections(): Promise<string[]> {
    return Promise.resolve([...this.data.keys()]);
  }

  public override count(collection: string): Promise<number> {
    return Promise.resolve((this.data.get(collection) ?? []).length);
  }

  public override indexes(collection: string): Promise<IndexDefinition[]> {
    return Promise.resolve(this.indexDefinitions.get(collection) ?? []);
  }

  public override async *documents(collection: string): AsyncGenerator<EjsonDocument> {
    for (const document of this.data.get(collection) ?? []) {
      await Promise.resolve();
      yield document;
    }
  }

  public override drop(collection: string): Promise<void> {
    this.data.delete(collection);
    this.indexDefinitions.delete(collection);
    return Promise.resolve();
  }

  public override ensureCollection(collection: string): Promise<void> {
    if (!this.data.has(collection)) {
      this.data.set(collection, []);
    }
    return Promise.resolve();
  }

  public override insert(collection: string, documents: ReadonlyArray<EjsonDocument>): Promise<void> {
    this.data.set(collection, [...(this.data.get(collection) ?? []), ...documents]);
    return Promise.resolve();
  }

  public override createIndexes(collection: string, indexes: ReadonlyArray<IndexDefinition>): Promise<void> {
    this.indexDefinitions.set(collection, [...indexes]);
    return Promise.resolve();
  }

  public override close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('BackupService', () => {
  const clock: FixedClock = new FixedClock(new Date('2026-10-01T03:00:00Z'));
  const passphrase: string = 'frase-de-paso-ficticia-2026';
  let workdir: string;

  beforeEach(async (): Promise<void> => {
    workdir = await mkdtemp(join(tmpdir(), 'asisteglt-backup-'));
  });

  afterEach(async (): Promise<void> => {
    await rm(workdir, { recursive: true, force: true });
  });

  function source(): MemoryBackupDatabase {
    const database: MemoryBackupDatabase = new MemoryBackupDatabase();
    const users: EjsonDocument[] = Array.from(
      { length: 1203 },
      (_value: unknown, index: number): EjsonDocument =>
        JSON.stringify({
          _id: { $oid: index.toString(16).padStart(24, '0') },
          email: `persona${String(index)}@demo.test`,
        }),
    );
    database.data.set('users', users);
    database.data.set('vacia', []);
    database.indexDefinitions.set('users', [
      { name: 'email_1', key: { email: 1 }, options: { unique: true } },
    ]);
    return database;
  }

  async function storageWithFiles(name: string): Promise<DiskBackupStorage> {
    const directory: string = join(workdir, name);
    const storage: DiskBackupStorage = new DiskBackupStorage(directory);
    await storage.write({ path: 'imports/lote-1/archivo.txt', content: Buffer.from('línea ficticia\n') });
    await storage.write({ path: 'evidence/foto.jpg', content: Buffer.from([0xff, 0xd8, 0xff, 0x00]) });
    return storage;
  }

  it('respalda, verifica y restaura base, índices y archivos con cifrado', async (): Promise<void> => {
    const file: string = join(workdir, 'respaldo.agbk');
    const created: ArchiveSummary = await new BackupService(
      source(),
      await storageWithFiles('origen'),
      clock,
    ).create(file, 'asisteglt', passphrase);
    expect(created.documents).toEqual({ users: 1203, vacia: 0 });
    expect(created.files).toBe(2);
    expect((await readFile(file)).includes(Buffer.from('persona1@demo.test'))).toBe(false);

    const target: MemoryBackupDatabase = new MemoryBackupDatabase();
    const targetStorage: DiskBackupStorage = new DiskBackupStorage(join(workdir, 'destino'));
    await new BackupService(target, targetStorage, clock).restore(file, passphrase, RestoreMode.SAFE);

    expect(target.data.get('users')).toEqual(source().data.get('users'));
    expect(target.data.get('vacia')).toEqual([]);
    expect(target.indexDefinitions.get('users')).toEqual([
      { name: 'email_1', key: { email: 1 }, options: { unique: true } },
    ]);
    expect((await targetStorage.paths()).sort()).toEqual(['evidence/foto.jpg', 'imports/lote-1/archivo.txt']);
    expect(Buffer.from(await targetStorage.read('evidence/foto.jpg'))).toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    );
  });

  it('rechaza una frase de paso incorrecta y un archivo alterado o truncado', async (): Promise<void> => {
    const file: string = join(workdir, 'respaldo.agbk');
    const service: BackupService = new BackupService(source(), await storageWithFiles('origen'), clock);
    await service.create(file, 'asisteglt', passphrase);
    await expect(service.verify(file, 'otra-frase-de-paso-larga')).rejects.toThrow(
      /frase de paso incorrecta/,
    );
    await expect(service.verify(file, null)).rejects.toThrow(/BACKUP_PASSPHRASE/);

    const bytes: Buffer = await readFile(file);
    const tampered: Buffer = Buffer.from(bytes);
    tampered[60] = (tampered[60] ?? 0) ^ 0xff;
    await writeFile(join(workdir, 'alterado.agbk'), tampered);
    await expect(service.verify(join(workdir, 'alterado.agbk'), passphrase)).rejects.toBeInstanceOf(
      BackupError,
    );

    await writeFile(join(workdir, 'truncado.agbk'), bytes.subarray(0, bytes.length - 40));
    await expect(service.verify(join(workdir, 'truncado.agbk'), passphrase)).rejects.toBeInstanceOf(
      BackupError,
    );
  });

  it('detecta un respaldo sin cifrar truncado por la suma y el cierre', async (): Promise<void> => {
    const file: string = join(workdir, 'plano.agbk');
    const service: BackupService = new BackupService(source(), await storageWithFiles('origen'), clock);
    await service.create(file, 'asisteglt', null);
    await expect(service.verify(file, null)).resolves.toBeInstanceOf(ArchiveSummary);
    const bytes: Buffer = await readFile(file);
    await writeFile(join(workdir, 'corto.agbk'), bytes.subarray(0, Math.floor(bytes.length / 2)));
    await expect(service.verify(join(workdir, 'corto.agbk'), null)).rejects.toBeInstanceOf(BackupError);
  });

  it('no sobrescribe datos existentes salvo en modo reemplazo', async (): Promise<void> => {
    const file: string = join(workdir, 'respaldo.agbk');
    await new BackupService(source(), await storageWithFiles('origen'), clock).create(
      file,
      'asisteglt',
      passphrase,
    );
    const occupied: MemoryBackupDatabase = new MemoryBackupDatabase();
    occupied.data.set('users', [JSON.stringify({ _id: 'existente' })]);
    const service: BackupService = new BackupService(
      occupied,
      new DiskBackupStorage(join(workdir, 'vacio')),
      clock,
    );

    await expect(service.restore(file, passphrase, RestoreMode.SAFE)).rejects.toThrow(/--reemplazar/);
    expect(occupied.data.get('users')).toHaveLength(1);

    await service.restore(file, passphrase, RestoreMode.REPLACE);
    expect(occupied.data.get('users')).toHaveLength(1203);
  });

  it('impide rutas de archivo fuera del directorio', async (): Promise<void> => {
    const storage: DiskBackupStorage = new DiskBackupStorage(join(workdir, 'seguro'));
    await expect(storage.write({ path: '../fuera.txt', content: Buffer.from('x') })).rejects.toBeInstanceOf(
      BackupError,
    );
    await expect(storage.write({ path: '/etc/fuera', content: Buffer.from('x') })).rejects.toBeInstanceOf(
      BackupError,
    );
  });
});
