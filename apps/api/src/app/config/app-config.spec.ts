import { ConfigurationError, LogLevel, RuntimeEnvironment } from '@asisteglt/api-platform';
import { AppConfig, AppConfigLoader } from './app-config';

const VALID: NodeJS.ProcessEnv = {
  MONGODB_URI: 'mongodb://localhost:27017/asisteglt?replicaSet=rs0',
  REDIS_URL: 'redis://localhost:6379',
};

describe('AppConfigLoader', () => {
  it('aplica valores por defecto seguros', () => {
    const config: AppConfig = AppConfigLoader.load(VALID);
    expect(config.port).toBe(3000);
    expect(config.environment).toBe(RuntimeEnvironment.DEVELOPMENT);
    expect(config.logLevel).toBe(LogLevel.INFO);
    expect(config.corsOrigins).toEqual(['http://localhost:4200']);
  });

  it('lee listas y enumeraciones', () => {
    const config: AppConfig = AppConfigLoader.load({
      ...VALID,
      NODE_ENV: 'production',
      API_CORS_ORIGINS: 'https://a.local, https://b.local',
    });
    expect(config.isProduction()).toBe(true);
    expect(config.corsOrigins).toEqual(['https://a.local', 'https://b.local']);
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
    expect(problems).toHaveLength(4);
    expect(problems.join(' ')).toContain('MONGODB_URI es obligatoria');
  });
});
