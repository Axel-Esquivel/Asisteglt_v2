import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Clock, SystemClock } from '@asisteglt/shared-kernel';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { CorrelationIdMiddleware } from './common/correlation/correlation-id.middleware';
import { PersistenceModule } from './common/persistence/persistence.module';
import { AppConfig } from './config/app-config';
import { ChatModule } from './contexts/chat/chat.module';
import { IamModule } from './contexts/iam/iam.module';
import { ProjectsModule } from './contexts/projects/projects.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

/** Módulo raíz. Se construye con la configuración ya validada (`AppModule.forRoot`). */
@Module({})
export class AppModule implements NestModule {
  public static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        PersistenceModule.forRoot(config.dataStore),
        IamModule.register(config.dataStore),
        ProjectsModule.register(config.dataStore),
        ChatModule.register(config.dataStore),
      ],
      controllers: [HealthController],
      providers: [
        { provide: AppConfig, useValue: config },
        { provide: Clock, useClass: SystemClock },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        HealthService,
      ],
      exports: [AppConfig, Clock],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
