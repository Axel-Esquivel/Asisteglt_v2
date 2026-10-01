import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppConfig } from './config/app-config';

/** Configuración HTTP común a `main.ts` y a las pruebas e2e. */
export class AppBootstrapper {
  public static readonly GLOBAL_PREFIX: string = 'api/v1';

  public static configure(app: INestApplication, config: AppConfig): void {
    app.setGlobalPrefix(AppBootstrapper.GLOBAL_PREFIX);
    app.use(helmet());
    app.enableCors({ origin: [...config.corsOrigins], credentials: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.enableShutdownHooks();
  }
}
