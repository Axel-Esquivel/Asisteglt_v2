import { Server } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppConfig, TrustProxy } from './config/app-config';

/** Configuración HTTP común a `main.ts` y a las pruebas e2e. */
export class AppBootstrapper {
  public static readonly GLOBAL_PREFIX: string = 'api/v1';
  /** Una clasificación puede llevar miles de cuentas exactas; el límite de Express (100 kB) no basta. */
  public static readonly JSON_BODY_LIMIT: string = '2mb';

  public static configure(app: NestExpressApplication<Server>, config: AppConfig): void {
    app.set('trust proxy', AppBootstrapper.trustProxySetting(config.trustProxy));
    app.disable('x-powered-by');
    app.setGlobalPrefix(AppBootstrapper.GLOBAL_PREFIX);
    app.use(helmet());
    app.useBodyParser('json', { limit: AppBootstrapper.JSON_BODY_LIMIT });
    app.enableCors({ origin: [...config.corsOrigins], credentials: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.enableShutdownHooks();
  }

  /** Traduce la opción de configuración al valor que espera Express para `trust proxy`. */
  public static trustProxySetting(trust: TrustProxy): boolean | string | number {
    switch (trust) {
      case TrustProxy.NONE:
        return false;
      case TrustProxy.LOOPBACK:
        return 'loopback';
      case TrustProxy.ONE_HOP:
        return 1;
      case TrustProxy.TWO_HOPS:
        return 2;
    }
  }
}
