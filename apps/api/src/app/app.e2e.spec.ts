import 'reflect-metadata';
import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceStatus } from '@asisteglt/shared-contracts';
import { Clock, FixedClock } from '@asisteglt/shared-kernel';
import request from 'supertest';
import { AppBootstrapper } from './app-bootstrapper';
import { AppModule } from './app.module';
import { AppConfig, AppConfigLoader } from './config/app-config';

describe('API (e2e)', () => {
  let app: INestApplication<Server>;
  const server = (): Server => app.getHttpServer();

  beforeAll(async (): Promise<void> => {
    const config: AppConfig = AppConfigLoader.load({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      REDIS_URL: 'redis://localhost:6379',
      APP_VERSION: '9.9.9',
    });
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(new FixedClock(new Date('2026-10-01T12:00:00Z')))
      .compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>();
    AppBootstrapper.configure(app, config);
    await app.init();
  });

  afterAll(async (): Promise<void> => {
    await app.close();
  });

  it('GET /api/v1/health responde el estado tipado', async (): Promise<void> => {
    const response = await request(server()).get('/api/v1/health').expect(200);
    const body: unknown = response.body;
    expect(body).toMatchObject({
      service: 'api',
      status: ServiceStatus.UP,
      version: '9.9.9',
      environment: 'test',
      timestamp: '2026-10-01T12:00:00.000Z',
    });
  });

  it('propaga el identificador de correlación y aplica cabeceras de seguridad', async (): Promise<void> => {
    const response = await request(server())
      .get('/api/v1/health')
      .set('x-correlation-id', 'prueba-12345678')
      .expect(200);
    expect(response.headers['x-correlation-id']).toBe('prueba-12345678');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('responde 404 con el cuerpo de error uniforme', async (): Promise<void> => {
    const response = await request(server()).get('/api/v1/no-existe').expect(404);
    const body: unknown = response.body;
    expect(body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
