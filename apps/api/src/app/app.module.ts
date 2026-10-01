import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Clock, SystemClock } from '@asisteglt/shared-kernel';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { CorrelationIdMiddleware } from './common/correlation/correlation-id.middleware';
import { AppConfig, AppConfigLoader } from './config/app-config';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: AppConfig, useFactory: (): AppConfig => AppConfigLoader.load(process.env) },
    { provide: Clock, useClass: SystemClock },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    HealthService,
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
