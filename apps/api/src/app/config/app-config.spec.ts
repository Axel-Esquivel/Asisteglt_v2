import { ConfigurationError, LogLevel, RuntimeEnvironment } from '@asisteglt/api-platform';
import { AppConfig, AppConfigLoader } from './app-config';

const VALID: NodeJS.ProcessEnv = {
  MONGODB_URI: 'mongodb://localhost:27017/asisteglt?replicaSet=rs0',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
};

describe('AppConfigLoader', () => {
  it('aplica valores por defecto seguros', () => {
    const config: AppConfig = AppConfigLoader.load(VALID);
    expect(config.port).toBe(3000);
    expect(config.environment).toBe(RuntimeEnvironment.DEVELOPMENT);
    expect(config.logLevel).toBe(LogLevel.INFO);
    expect(config.corsOrigins).toEqual(['http://localhost:4200']);
    expect(config.metricsToken).toBe('');
    expect(config.authRateLimitPerMinute).toBe(10);
  });

  it('exige un token de métricas largo si se define', () => {
    expect((): AppConfig => AppConfigLoader.load({ ...VALID, METRICS_TOKEN: 'corto' })).toThrow(
      ConfigurationError,
    );
    expect(AppConfigLoader.load({ ...VALID, METRICS_TOKEN: 'x'.repeat(24) }).metricsToken).toHaveLength(24);
  });

  it('lee listas y enumeraciones', () => {
    const config: AppConfig = AppConfigLoader.load({
      ...VALID,
      NODE_ENV: 'production',
      JWT_SECRET: 'Zq8c1Lr3wX0pN5tV7yB2mK4hJ6gF9dS1',
      API_CORS_ORIGINS: 'https://a.local, https://b.local',
    });
    expect(config.isProduction()).toBe(true);
    expect(config.corsOrigins).toEqual(['https://a.local', 'https://b.local']);
  });

  it('rechaza en producción los secretos de prueba publicados en el repositorio', () => {
    const testing: NodeJS.ProcessEnv = {
      ...VALID,
      JWT_SECRET: 'solo-desarrollo-secreto-de-prueba-no-usar-en-produccion',
      METRICS_TOKEN: 'solo-desarrollo-token-de-metricas',
    };
    expect(AppConfigLoader.load(testing).jwtSecret).toContain('solo-desarrollo');
    let problems: ReadonlyArray<string> = [];
    try {
      AppConfigLoader.load({ ...testing, NODE_ENV: 'production' });
    } catch (error: unknown) {
      if (error instanceof ConfigurationError) {
        problems = error.problems;
      }
    }
    expect(problems).toEqual([
      'JWT_SECRET usa un valor de prueba del repositorio; genera uno propio para producción',
      'METRICS_TOKEN usa un valor de prueba del repositorio; genera uno propio para producción',
    ]);
    expect(
      AppConfigLoader.load({
        ...VALID,
        NODE_ENV: 'production',
        JWT_SECRET: 'Zq8c1Lr3wX0pN5tV7yB2mK4hJ6gF9dS1',
      }).jwtSecret,
    ).toHaveLength(32);
  });

  it('no permite datos de demostración en producción', () => {
    const production: NodeJS.ProcessEnv = {
      ...VALID,
      NODE_ENV: 'production',
      JWT_SECRET: 'Zq8c1Lr3wX0pN5tV7yB2mK4hJ6gF9dS1',
    };
    expect((): AppConfig => AppConfigLoader.load({ ...production, DEMO_SEED: 'true' })).toThrow(
      /DEMO_SEED=true/,
    );
    expect(AppConfigLoader.load({ ...production, DEMO_SEED: 'false' }).demoSeed).toBe(false);
  });

  it('informa todos los problemas a la vez', () => {
    let problems: ReadonlyArray<string> = [];
    try {
      AppConfigLoader.load({ API_PORT: '99999', NODE_ENV: 'staging', REDIS_URL: 'http://x' });
    } catch (error: unknown) {
      if (error instanceof ConfigurationError) {
        problems = error.problems;
      }
    }
    expect(problems).toHaveLength(5);
    expect(problems.join(' ')).toContain('MONGODB_URI es obligatoria');
  });
});
