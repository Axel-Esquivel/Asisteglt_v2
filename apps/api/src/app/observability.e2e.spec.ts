import { randomUUID } from 'node:crypto';
import { ServiceStatus } from '@asisteglt/shared-contracts';
import request, { Response } from 'supertest';
import { AuthenticatedClient, TestApp } from '../testing/test-app';

describe('Observabilidad (e2e)', () => {
  const token: string = 'token-de-metricas-de-prueba-0123456789';
  let app: TestApp;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.startWith(null, { METRICS_TOKEN: token });
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('oculta /metrics sin el token correcto', async (): Promise<void> => {
    await request(app.server()).get('/api/v1/metrics').expect(404);
    await request(app.server()).get('/api/v1/metrics').set('authorization', 'Bearer otro-token').expect(404);
  });

  it('expone métricas Prometheus con la plantilla de la ruta, nunca los ids', async (): Promise<void> => {
    const client: AuthenticatedClient = await app.register('metricas@demo.test', 'Métricas');
    const projectId: string = randomUUID();
    await request(app.server()).get(`/api/v1/projects/${projectId}`).set('authorization', client.bearer());
    await request(app.server()).get('/api/v1/no-existe').expect(404);

    const response: Response = await request(app.server())
      .get('/api/v1/metrics')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('version=0.0.4');
    const text: string = response.text;
    expect(text).toContain(
      'asisteglt_http_requests_total{method="POST",route="/api/v1/auth/register",status="201"} 1',
    );
    expect(text).toMatch(
      /asisteglt_http_requests_total\{method="GET",route="\/api\/v1\/projects\/:id",status="\d+"\} 1/,
    );
    expect(text).toContain('route="sin-ruta",status="404"');
    expect(text).toContain(
      'asisteglt_http_request_duration_seconds_bucket{method="POST",route="/api/v1/auth/register",le="+Inf"} 1',
    );
    expect(text).toContain('asisteglt_process_resident_memory_bytes ');
    expect(text).toContain('asisteglt_realtime_connections 0');
    expect(text).toContain('asisteglt_build_info{environment="test",version="9.9.9"} 1');
    expect(text).not.toContain(projectId);
  });

  it('acepta X-Request-Id y el trace-id de traceparent como correlación', async (): Promise<void> => {
    const byRequestId: Response = await request(app.server())
      .get('/api/v1/health')
      .set('x-request-id', 'nginx-0123456789abcdef')
      .expect(200);
    expect(byRequestId.headers['x-correlation-id']).toBe('nginx-0123456789abcdef');
    expect(byRequestId.headers['x-request-id']).toBe('nginx-0123456789abcdef');
    const byTrace: Response = await request(app.server())
      .get('/api/v1/health')
      .set('traceparent', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')
      .expect(200);
    expect(byTrace.headers['x-correlation-id']).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('informa la preparación (sin dependencias externas en memoria)', async (): Promise<void> => {
    const response: Response = await request(app.server()).get('/api/v1/health/ready').expect(200);
    const body: unknown = response.body;
    expect(body).toMatchObject({ status: ServiceStatus.UP, checks: [] });
  });
});
