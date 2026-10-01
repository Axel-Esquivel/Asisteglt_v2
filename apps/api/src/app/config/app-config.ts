import { EnvironmentReader, EnvironmentSource, LogLevel, RuntimeEnvironment } from '@asisteglt/api-platform';
import { DataStore } from '../common/persistence/data-store';

/** Configuración tipada de la API; se valida completa al arrancar. */
export class AppConfig {
  public constructor(
    public readonly environment: RuntimeEnvironment,
    public readonly port: number,
    public readonly corsOrigins: ReadonlyArray<string>,
    public readonly logLevel: LogLevel,
    public readonly dataStore: DataStore,
    public readonly mongoUri: string,
    public readonly redisUrl: string,
    public readonly version: string,
    public readonly jwtSecret: string,
    public readonly accessTokenTtlSeconds: number,
    public readonly refreshTokenTtlDays: number,
    public readonly secureCookies: boolean,
    public readonly storageDir: string,
    public readonly importRejectThreshold: number,
  ) {}

  public isProduction(): boolean {
    return this.environment === RuntimeEnvironment.PRODUCTION;
  }
}

export class AppConfigLoader {
  public static load(source: EnvironmentSource): AppConfig {
    const env: EnvironmentReader = new EnvironmentReader(source);
    const environment: RuntimeEnvironment = env.enumValue(
      'NODE_ENV',
      Object.values(RuntimeEnvironment),
      RuntimeEnvironment.DEVELOPMENT,
    );
    const config: AppConfig = new AppConfig(
      environment,
      env.port('API_PORT', 3000),
      env.list('API_CORS_ORIGINS', ['http://localhost:4200']),
      env.enumValue('LOG_LEVEL', Object.values(LogLevel), LogLevel.INFO),
      env.enumValue('DATA_STORE', Object.values(DataStore), DataStore.MONGO),
      env.requiredUrl('MONGODB_URI', ['mongodb:', 'mongodb+srv:']),
      env.requiredUrl('REDIS_URL', ['redis:', 'rediss:']),
      env.text('APP_VERSION', '0.1.0'),
      env.secret('JWT_SECRET', 32),
      env.positiveInteger('ACCESS_TOKEN_TTL_SECONDS', 900),
      env.positiveInteger('REFRESH_TOKEN_TTL_DAYS', 14),
      env.enumValue('SECURE_COOKIES', ['true', 'false'], environment === RuntimeEnvironment.PRODUCTION ? 'true' : 'false') ===
        'true',
      env.text('STORAGE_DIR', 'var/storage'),
      env.positiveInteger('IMPORT_REJECT_THRESHOLD_PERCENT', 20) / 100,
    );
    env.assertValid();
    return config;
  }
}
