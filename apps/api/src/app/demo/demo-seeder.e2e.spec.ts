import request, { Response } from 'supertest';
import { AuthenticatedClient, TestApp } from '../../testing/test-app';
import { DemoData } from './demo-data';

describe('Datos de demostración (e2e)', () => {
  let app: TestApp;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.startWith(null, { DEMO_SEED: 'true' });
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('siembra proyectos, datos publicados, un informe y una toma en curso', async (): Promise<void> => {
    const login: Response = await request(app.server())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@demo.asisteglt.local', password: DemoData.PASSWORD })
      .expect(200);
    const admin: AuthenticatedClient = AuthenticatedClient.from(login);
    const projects: Response = await request(app.server())
      .get('/api/v1/projects')
      .set('authorization', admin.bearer())
      .expect(200);
    const list: unknown = projects.body;
    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Demo · Balance ficticio', moduleType: 'REPORTS' }),
        expect.objectContaining({ name: 'Demo · Bodega ficticia', moduleType: 'INVENTORY', memberCount: 3 }),
      ]),
    );
    const items: unknown[] = Array.isArray(list) ? list : [];
    const id = (name: string): string => {
      const found: unknown =
        items.find(
          (p: unknown): boolean => typeof p === 'object' && p !== null && Reflect.get(p, 'name') === name,
        ) ?? null;
      const value: unknown = typeof found === 'object' && found !== null ? Reflect.get(found, 'id') : null;
      return typeof value === 'string' ? value : '';
    };
    const reports: string = id('Demo · Balance ficticio');
    const records: Response = await request(app.server())
      .get(`/api/v1/projects/${reports}/records?period=2026-08`)
      .set('authorization', admin.bearer())
      .expect(200);
    const recordsBody: unknown = records.body;
    expect(recordsBody).toMatchObject({ total: 9 });
    const definitions: Response = await request(app.server())
      .get(`/api/v1/projects/${reports}/report-definitions`)
      .set('authorization', admin.bearer())
      .expect(200);
    const definitionId: unknown = Array.isArray(definitions.body)
      ? Reflect.get(definitions.body[0] ?? {}, 'id')
      : null;
    const run: Response = await request(app.server())
      .get(`/api/v1/projects/${reports}/report-definitions/${String(definitionId)}/run?period=2026-08`)
      .set('authorization', admin.bearer())
      .expect(200);
    const runBody: unknown = run.body;
    expect(runBody).toMatchObject({ records: 5 });
    const counts: Response = await request(app.server())
      .get(`/api/v1/projects/${id('Demo · Bodega ficticia')}/inventory/counts`)
      .set('authorization', admin.bearer())
      .expect(200);
    const countsBody: unknown = counts.body;
    expect(countsBody).toEqual([expect.objectContaining({ status: 'IN_PROGRESS', items: 8 })]);
  });
});
