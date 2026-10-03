import { DynamicModule, MiddlewareConsumer, Module, NestModule, Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MetricsRegistry } from '@asisteglt/api-platform';
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
import { HttpObservabilityMiddleware } from './common/observability/http-observability.middleware';
import { MetricsController } from './common/observability/metrics.controller';
import { ProcessMetrics } from './common/observability/process-metrics';
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
import { MongoReadinessProbe, ReadinessProbes, StorageReadinessProbe } from './health/readiness-probes';
import { MongoDatabase } from './common/persistence/mongo-database';
import { DataStore } from './common/persistence/data-store';

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
      controllers: [HealthController, MetricsController],
      providers: [
        { provide: AppConfig, useValue: config },
        { provide: Clock, useClass: SystemClock },
        { provide: MetricsRegistry, useValue: new MetricsRegistry() },
        ProcessMetrics,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: SecurityAuditLog, useClass: LoggerSecurityAuditLog },
        { provide: RateLimitStore, useValue: new InMemoryRateLimitStore() },
        { provide: RateLimitPolicies, useValue: RateLimitPolicies.forAuth(config.authRateLimitPerMinute) },
        RateLimiter,
        { provide: APP_GUARD, useClass: RateLimitGuard },
        AppModule.readinessProbes(config),
        HealthService,
        DemoSeeder,
      ],
      exports: [AppConfig, Clock, SecurityAuditLog, MetricsRegistry],
    };
  }

  /** Con MongoDB se comprueban la base y el directorio de archivos; en memoria no hay dependencias. */
  private static readinessProbes(config: AppConfig): Provider {
    if (config.dataStore !== DataStore.MONGO) {
      return { provide: ReadinessProbes, useValue: new ReadinessProbes([]) };
    }
    return {
      provide: ReadinessProbes,
      useFactory: (database: MongoDatabase): ReadinessProbes =>
        new ReadinessProbes([
          new MongoReadinessProbe(database),
          new StorageReadinessProbe(config.storageDir),
        ]),
      inject: [MongoDatabase],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, HttpObservabilityMiddleware).forRoutes('{*path}');
  }
}
