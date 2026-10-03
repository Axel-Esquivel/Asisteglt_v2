import { EnvironmentReader } from '@asisteglt/api-platform';
import { Nullable, SystemClock } from '@asisteglt/shared-kernel';
import { ArchiveSummary, BackupError } from './backup-archive';
import { BackupService, RestoreMode } from './backup.service';
import { DiskBackupStorage } from './disk-backup-storage';
import { MongoBackupDatabase } from './mongo-backup-database';

/** Orden pedida en la línea de comandos. */
class BackupCommand {
  private static readonly USAGE: string = [
    'Uso: node backup.js <crear|verificar|restaurar> <archivo> [--reemplazar] [--sin-cifrar]',
    'Variables: MONGODB_URI, STORAGE_DIR y BACKUP_PASSPHRASE (mínimo 12 caracteres).',
  ].join('\n');

  private constructor(
    public readonly action: 'crear' | 'verificar' | 'restaurar',
    public readonly file: string,
    public readonly replace: boolean,
    public readonly unencrypted: boolean,
  ) {}

  public static parse(argv: ReadonlyArray<string>): BackupCommand {
    const flags: ReadonlyArray<string> = argv.filter((arg: string): boolean => arg.startsWith('--'));
    const positional: ReadonlyArray<string> = argv.filter((arg: string): boolean => !arg.startsWith('--'));
    const unknown: ReadonlyArray<string> = flags.filter(
      (flag: string): boolean => flag !== '--reemplazar' && flag !== '--sin-cifrar',
    );
    const action: Nullable<string> = positional[0] ?? null;
    const file: Nullable<string> = positional[1] ?? null;
    if (
      unknown.length > 0 ||
      positional.length !== 2 ||
      file === null ||
      (action !== 'crear' && action !== 'verificar' && action !== 'restaurar')
    ) {
      throw new BackupError(BackupCommand.USAGE);
    }
    return new BackupCommand(action, file, flags.includes('--reemplazar'), flags.includes('--sin-cifrar'));
  }
}

/** Punto de entrada de `backup.js` (se compila junto a la API y viaja en su imagen Docker). */
class BackupCli {
  public static async run(argv: ReadonlyArray<string>, env: NodeJS.ProcessEnv): Promise<void> {
    const command: BackupCommand = BackupCommand.parse(argv);
    const reader: EnvironmentReader = new EnvironmentReader(env);
    const uri: string = reader.requiredUrl('MONGODB_URI', ['mongodb:', 'mongodb+srv:']);
    const storageDir: string = reader.text('STORAGE_DIR', 'var/storage');
    const passphrase: string = reader.text('BACKUP_PASSPHRASE', '');
    reader.assertValid();
    if (command.action === 'crear' && passphrase === '' && !command.unencrypted) {
      throw new BackupError(
        'El respaldo contiene datos confidenciales: define BACKUP_PASSPHRASE o usa --sin-cifrar a sabiendas.',
      );
    }
    const database: MongoBackupDatabase = await MongoBackupDatabase.connect(uri);
    try {
      const service: BackupService = new BackupService(
        database,
        new DiskBackupStorage(storageDir),
        new SystemClock(),
      );
      const secret: Nullable<string> = passphrase === '' || command.unencrypted ? null : passphrase;
      const summary: ArchiveSummary = await BackupCli.execute(
        service,
        command,
        database.databaseName(),
        secret,
      );
      process.stdout.write(BackupCli.describe(command, summary));
    } finally {
      await database.close();
    }
  }

  private static execute(
    service: BackupService,
    command: BackupCommand,
    databaseName: string,
    passphrase: Nullable<string>,
  ): Promise<ArchiveSummary> {
    switch (command.action) {
      case 'crear':
        return service.create(command.file, databaseName, passphrase);
      case 'verificar':
        return service.verify(command.file, passphrase);
      case 'restaurar':
        return service.restore(
          command.file,
          passphrase,
          command.replace ? RestoreMode.REPLACE : RestoreMode.SAFE,
        );
    }
  }

  private static describe(command: BackupCommand, summary: ArchiveSummary): string {
    const verb: string =
      command.action === 'crear'
        ? 'Respaldo creado y verificado'
        : command.action === 'verificar'
          ? 'Respaldo íntegro'
          : 'Restauración completa';
    return [
      `${verb}: ${command.file}`,
      `  Base de origen: ${summary.header.database} (${summary.header.createdAt})`,
      `  Colecciones: ${String(summary.collections().length)} · documentos: ${String(summary.totalDocuments())} · archivos: ${String(summary.files)}`,
      '',
    ].join('\n');
  }
}

BackupCli.run(process.argv.slice(2), process.env).catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(error instanceof BackupError ? 2 : 1);
});
