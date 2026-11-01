import {
  EnvironmentReader,
  EnvironmentSource,
  PublicTestSecrets,
  RuntimeEnvironment,
} from '@asisteglt/api-platform';

/** Configuración de `backup.js` leída del entorno; se valida completa antes de conectar. */
export class BackupSettings {
  private constructor(
    public readonly mongoUri: string,
    public readonly storageDir: string,
    /** Vacía si no se definió (solo `--sin-cifrar` o respaldos sin cifrar). */
    public readonly passphrase: string,
  ) {}

  public static load(source: EnvironmentSource): BackupSettings {
    const env: EnvironmentReader = new EnvironmentReader(source);
    const environment: RuntimeEnvironment = env.enumValue(
      'NODE_ENV',
      Object.values(RuntimeEnvironment),
      RuntimeEnvironment.DEVELOPMENT,
    );
    const settings: BackupSettings = new BackupSettings(
      env.requiredUrl('MONGODB_URI', ['mongodb:', 'mongodb+srv:']),
      env.text('STORAGE_DIR', 'var/storage'),
      env.text('BACKUP_PASSPHRASE', ''),
    );
    // Las imágenes Docker corren con NODE_ENV=production: ahí una frase publicada en el repositorio
    // dejaría los respaldos de datos del cliente al alcance de cualquiera.
    if (environment === RuntimeEnvironment.PRODUCTION && PublicTestSecrets.isPublic(settings.passphrase)) {
      env.reject(
        'BACKUP_PASSPHRASE usa un valor de prueba del repositorio; en producción usa una frase propia',
      );
    }
    env.assertValid();
    return settings;
  }
}
