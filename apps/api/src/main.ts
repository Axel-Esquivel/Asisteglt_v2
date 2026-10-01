import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppBootstrapper } from './app/app-bootstrapper';
import { AppModule } from './app/app.module';
import { JsonLogger } from '@asisteglt/api-platform';
import { AppConfig, AppConfigLoader } from './app/config/app-config';

async function bootstrap(): Promise<void> {
  const config: AppConfig = AppConfigLoader.load(process.env);
  const app: INestApplication = await NestFactory.create(AppModule.forRoot(config), { logger: JsonLogger.toStdout(config.logLevel) });
  AppBootstrapper.configure(app, config);
  await app.listen(config.port);
}

bootstrap().catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
