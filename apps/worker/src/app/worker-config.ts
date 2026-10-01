import { EnvironmentReader, EnvironmentSource, LogLevel, RuntimeEnvironment } from '@asisteglt/api-platform';

/** Configuración del worker de colas (BullMQ se conecta en la fase de ingestión). */
export class WorkerConfig {
  public constructor(
    public readonly environment: RuntimeEnvironment,
    public readonly logLevel: LogLevel,
    public readonly mongoUri: string,
    public readonly redisUrl: string,
    public readonly concurrency: number,
  ) {}

  public static load(source: EnvironmentSource): WorkerConfig {
    const env: EnvironmentReader = new EnvironmentReader(source);
    const config: WorkerConfig = new WorkerConfig(
      env.enumValue('NODE_ENV', Object.values(RuntimeEnvironment), RuntimeEnvironment.DEVELOPMENT),
      env.enumValue('LOG_LEVEL', Object.values(LogLevel), LogLevel.INFO),
      env.requiredUrl('MONGODB_URI', ['mongodb:', 'mongodb+srv:']),
      env.requiredUrl('REDIS_URL', ['redis:', 'rediss:']),
      env.positiveInteger('WORKER_CONCURRENCY', 2),
    );
    env.assertValid();
    return config;
  }
}
