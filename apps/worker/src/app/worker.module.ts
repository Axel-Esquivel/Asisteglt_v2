import { Module } from '@nestjs/common';
import { WorkerConfig } from './worker-config';
import { WorkerLifecycle } from './worker-lifecycle';

@Module({
  providers: [{ provide: WorkerConfig, useFactory: (): WorkerConfig => WorkerConfig.load(process.env) }, WorkerLifecycle],
})
export class WorkerModule {}
