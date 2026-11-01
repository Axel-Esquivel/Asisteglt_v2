import { ConfigurationError } from '@asisteglt/api-platform';
import { BackupSettings } from './backup-settings';

describe('BackupSettings', () => {
  const base: NodeJS.ProcessEnv = {
    MONGODB_URI: 'mongodb://localhost:27017/asisteglt_dev',
    BACKUP_PASSPHRASE: 'solo-desarrollo-frase-de-respaldo',
  };

  it('acepta la frase de prueba fuera de producción', (): void => {
    const settings: BackupSettings = BackupSettings.load(base);
    expect(settings.passphrase).toBe('solo-desarrollo-frase-de-respaldo');
    expect(settings.storageDir).toBe('var/storage');
  });

  it('rechaza en producción una frase publicada en el repositorio', (): void => {
    expect((): BackupSettings => BackupSettings.load({ ...base, NODE_ENV: 'production' })).toThrow(
      ConfigurationError,
    );
    expect(
      BackupSettings.load({ ...base, NODE_ENV: 'production', BACKUP_PASSPHRASE: 'Hk3v-frase-propia-9q' })
        .passphrase,
    ).toBe('Hk3v-frase-propia-9q');
  });

  it('exige MONGODB_URI', (): void => {
    expect((): BackupSettings => BackupSettings.load({})).toThrow(ConfigurationError);
  });
});
