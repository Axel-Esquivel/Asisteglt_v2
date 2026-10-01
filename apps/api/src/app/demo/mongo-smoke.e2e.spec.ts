import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request, { Response } from 'supertest';
import { AuthenticatedClient, TestApp } from '../../testing/test-app';
import { DemoData } from './demo-data';

/**
 * Prueba de humo opcional contra un servidor MongoDB real (o compatible): siembra los datos de
 * demostración —que recorren los repositorios de todos los contextos— y los vuelve a leer.
 * Se ejecuta solo con `MONGO_SMOKE_URI=mongodb://… npx nx run api:test`.
 */
const uri: string = process.env['MONGO_SMOKE_URI'] ?? '';

describe.skipIf(uri === '')('Persistencia MongoDB (humo)', () => {
  let app: TestApp;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.startWith(null, {
      DATA_STORE: 'mongo',
      MONGODB_URI: uri,
      DEMO_SEED: 'true',
      STORAGE_DIR: mkdtempSync(join(tmpdir(), 'asisteglt-smoke-')),
    });
  }, 60_000);

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('guarda y lee proyectos, datos, informes e inventario', async (): Promise<void> => {
    const login: Response = await request(app.server())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@demo.asisteglt.local', password: DemoData.PASSWORD })
      .expect(200);
    const admin: AuthenticatedClient = AuthenticatedClient.from(login);
    const projects: Response = await request(app.server())
      .get('/api/v1/projects')
      .set('authorization', admin.bearer())
      .expect(200);
    const list: unknown[] = Array.isArray(projects.body) ? projects.body : [];
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const project of list) {
      const id: unknown = typeof project === 'object' && project !== null ? Reflect.get(project, 'id') : null;
      const moduleType: unknown =
        typeof project === 'object' && project !== null ? Reflect.get(project, 'moduleType') : null;
      if (moduleType === 'REPORTS') {
        const records: Response = await request(app.server())
          .get(`/api/v1/projects/${String(id)}/records`)
          .set('authorization', admin.bearer())
          .expect(200);
        const body: unknown = records.body;
        expect(body).toMatchObject({ total: 18 });
        await request(app.server())
          .get(`/api/v1/projects/${String(id)}/imports`)
          .set('authorization', admin.bearer())
          .expect(200);
        await request(app.server())
          .get(`/api/v1/projects/${String(id)}/report-definitions`)
          .set('authorization', admin.bearer())
          .expect(200);
      } else {
        const counts: Response = await request(app.server())
          .get(`/api/v1/projects/${String(id)}/inventory/counts`)
          .set('authorization', admin.bearer())
          .expect(200);
        const body: unknown = counts.body;
        expect(body).toEqual([expect.objectContaining({ status: 'IN_PROGRESS', items: 8 })]);
      }
    }
  });
});
