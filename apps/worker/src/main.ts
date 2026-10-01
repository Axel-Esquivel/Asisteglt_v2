import 'reflect-metadata';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JsonLogger } from '@asisteglt/api-platform';
import { WorkerConfig } from './app/worker-config';
import { WorkerModule } from './app/worker.module';

async function bootstrap(): Promise<void> {
  const config: WorkerConfig = WorkerConfig.load(process.env);
  const context: INestApplicationContext = await NestFactory.createApplicationContext(WorkerModule, {
    logger: JsonLogger.toStdout(config.logLevel),
  });
  context.enableShutdownHooks();
}

bootstrap().catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
