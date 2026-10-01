import { EnvironmentReader, EnvironmentSource, LogLevel, RuntimeEnvironment } from '@asisteglt/api-platform';

/** Configuración tipada de la API; se valida completa al arrancar. */
export class AppConfig {
  public constructor(
    public readonly environment: RuntimeEnvironment,
    public readonly port: number,
    public readonly corsOrigins: ReadonlyArray<string>,
    public readonly logLevel: LogLevel,
    public readonly mongoUri: string,
    public readonly redisUrl: string,
    public readonly version: string,
  ) {}

  public isProduction(): boolean {
    return this.environment === RuntimeEnvironment.PRODUCTION;
  }
}

export class AppConfigLoader {
  public static load(source: EnvironmentSource): AppConfig {
    const env: EnvironmentReader = new EnvironmentReader(source);
    const config: AppConfig = new AppConfig(
      env.enumValue('NODE_ENV', Object.values(RuntimeEnvironment), RuntimeEnvironment.DEVELOPMENT),
      env.port('API_PORT', 3000),
      env.list('API_CORS_ORIGINS', ['http://localhost:4200']),
      env.enumValue('LOG_LEVEL', Object.values(LogLevel), LogLevel.INFO),
      env.requiredUrl('MONGODB_URI', ['mongodb:', 'mongodb+srv:']),
      env.requiredUrl('REDIS_URL', ['redis:', 'rediss:']),
      env.text('APP_VERSION', '0.1.0'),
    );
    env.assertValid();
    return config;
  }
}
