import { ServiceStatus } from '@asisteglt/shared-contracts';
import { FixedClock } from '@asisteglt/shared-kernel';
import request from 'supertest';
import { TestApp } from '../testing/test-app';

describe('API (e2e)', () => {
  let app: TestApp;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.start(new FixedClock(new Date('2026-10-01T12:00:00Z')));
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('GET /api/v1/health responde el estado tipado (ruta pública)', async (): Promise<void> => {
    const response = await request(app.server()).get('/api/v1/health').expect(200);
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
    const response = await request(app.server())
      .get('/api/v1/health')
      .set('x-correlation-id', 'prueba-12345678')
      .expect(200);
    expect(response.headers['x-correlation-id']).toBe('prueba-12345678');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('exige autenticación en rutas protegidas', async (): Promise<void> => {
    const response = await request(app.server()).get('/api/v1/auth/me').expect(401);
    const body: unknown = response.body;
    expect(body).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
  });
});
