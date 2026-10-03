import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Clock, SystemClock } from '@asisteglt/shared-kernel';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { CorrelationIdMiddleware } from './common/correlation/correlation-id.middleware';
import { RateLimitGuard } from './common/security/rate-limit.guard';
import {
  InMemoryRateLimitStore,
  RateLimitPolicies,
  RateLimitStore,
  RateLimiter,
} from './common/security/rate-limit';
import { LoggerSecurityAuditLog, SecurityAuditLog } from './common/security/security-audit-log';
import { PersistenceModule } from './common/persistence/persistence.module';
import { AppConfig } from './config/app-config';
import { ChatModule } from './contexts/chat/chat.module';
import { IamModule } from './contexts/iam/iam.module';
import { InventoryModule } from './contexts/inventory/inventory.module';
import { ProjectsModule } from './contexts/projects/projects.module';
import { ReportsModule } from './contexts/reports/reports.module';
import { DemoSeeder } from './demo/demo-seeder';
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
        ReportsModule.register(config.dataStore),
        InventoryModule.register(config.dataStore),
      ],
      controllers: [HealthController],
      providers: [
        { provide: AppConfig, useValue: config },
        { provide: Clock, useClass: SystemClock },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: SecurityAuditLog, useClass: LoggerSecurityAuditLog },
        { provide: RateLimitStore, useValue: new InMemoryRateLimitStore() },
        { provide: RateLimitPolicies, useValue: RateLimitPolicies.forAuth(config.authRateLimitPerMinute) },
        RateLimiter,
        { provide: APP_GUARD, useClass: RateLimitGuard },
        HealthService,
        DemoSeeder,
      ],
      exports: [AppConfig, Clock, SecurityAuditLog],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
