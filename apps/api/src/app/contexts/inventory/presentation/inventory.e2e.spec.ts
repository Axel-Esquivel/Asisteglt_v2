import request, { Response } from 'supertest';
import { AuthenticatedClient, TestApp } from '../../../../testing/test-app';

class Body {
  public static get(body: unknown, key: string): unknown {
    return typeof body === 'object' && body !== null && key in body ? Reflect.get(body, key) : null;
  }

  public static text(body: unknown, key: string): string {
    const value: unknown = Body.get(body, key);
    if (typeof value !== 'string') {
      throw new Error(`Falta ${key}`);
    }
    return value;
  }

  public static list(body: unknown): unknown[] {
    if (!Array.isArray(body)) {
      throw new Error('Se esperaba una lista');
    }
    const items: unknown[] = body;
    return items;
  }
}

describe('Inventarios (e2e)', () => {
  let app: TestApp;
  let owner: AuthenticatedClient;
  let ana: AuthenticatedClient;
  let beto: AuthenticatedClient;
  let projectId: string;

  const api = (path: string): string => `/api/v1/projects/${projectId}/inventory/counts${path}`;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.start(null);
    owner = await app.register('jefa.inventario@demo.test', 'Jefa Inventario');
    ana = await app.register('ana.conteo@demo.test', 'Ana Conteo');
    beto = await app.register('beto.conteo@demo.test', 'Beto Conteo');
    const project: Response = await request(app.server())
      .post('/api/v1/projects')
      .set('authorization', owner.bearer())
      .send({ name: 'Toma ficticia', description: '', moduleType: 'INVENTORY' })
      .expect(201);
    projectId = Body.text(project.body, 'id');
    for (const email of ['ana.conteo@demo.test', 'beto.conteo@demo.test']) {
      await request(app.server())
        .post(`/api/v1/projects/${projectId}/members`)
        .set('authorization', owner.bearer())
        .send({ email, role: 'COUNTER' })
        .expect(204);
    }
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('asigna por zonas, cuenta a ciegas, recuenta con otro contador y cierra', async (): Promise<void> => {
    const created: Response = await request(app.server())
      .post(api(''))
      .set('authorization', owner.bearer())
      .send({
        name: 'Bodega central 2026',
        warehouse: 'Central',
        toleranceKind: 'ABSOLUTE',
        toleranceValue: '1',
        maxRounds: 3,
      })
      .expect(201);
    const countId: string = Body.text(created.body, 'id');
    await request(app.server())
      .put(api(`/${countId}/items`))
      .set('authorization', owner.bearer())
      .send({
        items: [
          {
            sku: 'P-001',
            description: 'Tornillo ficticio',
            unit: 'u',
            location: 'A-01',
            expectedQuantity: '100',
            unitCost: '0.50',
          },
          {
            sku: 'P-002',
            description: 'Tuerca ficticia',
            unit: 'u',
            location: 'A-02',
            expectedQuantity: '40',
            unitCost: '0.25',
          },
          {
            sku: 'P-003',
            description: 'Arandela ficticia',
            unit: 'u',
            location: 'B-01',
            expectedQuantity: '10',
            unitCost: null,
          },
          {
            sku: 'P-004',
            description: 'Clavo ficticio',
            unit: 'u',
            location: 'B-02',
            expectedQuantity: '7',
            unitCost: '1',
          },
        ],
      })
      .expect(200);
    await request(app.server())
      .put(api(`/${countId}/participants`))
      .set('authorization', owner.bearer())
      .send({
        participants: [
          { userId: ana.userId, role: 'COUNTER' },
          { userId: beto.userId, role: 'COUNTER' },
          { userId: owner.userId, role: 'SUPERVISOR' },
        ],
      })
      .expect(200);
    const started: Response = await request(app.server())
      .post(api(`/${countId}/start`))
      .set('authorization', owner.bearer())
      .expect(201);
    const startedBody: unknown = started.body;
    expect(startedBody).toMatchObject({ status: 'IN_PROGRESS', rounds: [{ number: 1, items: 4 }] });

    const work = async (client: AuthenticatedClient): Promise<unknown[]> => {
      const response: Response = await request(app.server())
        .get(api(`/${countId}/my-work`))
        .set('authorization', client.bearer())
        .expect(200);
      return Body.list(Body.get(response.body, 'items'));
    };
    const anaItems: unknown[] = await work(ana);
    const betoItems: unknown[] = await work(beto);
    expect(anaItems).toHaveLength(2);
    expect(betoItems).toHaveLength(2);
    expect(anaItems[0]).not.toHaveProperty('expected');
    const zone = (items: unknown[]): string => Body.text(items[0], 'location').charAt(0);
    expect(zone(anaItems)).not.toBe(zone(betoItems));

    const count = (client: AuthenticatedClient, itemId: string, quantity: string): request.Test =>
      request(app.server())
        .post(api(`/${countId}/entries`))
        .set('authorization', client.bearer())
        .send({ itemId, quantity, comment: '' });
    await count(ana, Body.text(betoItems[0], 'itemId'), '1').expect(400);
    await count(ana, Body.text(anaItems[0], 'itemId'), '-3').expect(400);
    const sku = (item: unknown): string => Body.text(item, 'sku');
    const expected: Record<string, string> = { 'P-001': '100', 'P-002': '40', 'P-003': '10', 'P-004': '7' };
    for (const item of anaItems) {
      await count(
        ana,
        Body.text(item, 'itemId'),
        sku(item) === 'P-001' ? '95' : (expected[sku(item)] ?? '0'),
      ).expect(204);
    }
    for (const item of betoItems) {
      await count(
        beto,
        Body.text(item, 'itemId'),
        sku(item) === 'P-001' ? '95' : (expected[sku(item)] ?? '0'),
      ).expect(204);
    }
    await request(app.server())
      .get(api(`/${countId}/supervision`))
      .set('authorization', ana.bearer())
      .expect(403);
    const supervision: Response = await request(app.server())
      .get(api(`/${countId}/supervision`))
      .set('authorization', owner.bearer())
      .expect(200);
    const supervisionBody: unknown = supervision.body;
    expect(supervisionBody).toMatchObject({ counted: 4, exceeding: 1, differenceValue: '-2.50' });

    await request(app.server())
      .post(api(`/${countId}/rounds/close`))
      .set('authorization', owner.bearer())
      .expect(201);
    const recount: Response = await request(app.server())
      .post(api(`/${countId}/recount`))
      .set('authorization', owner.bearer())
      .expect(201);
    const rounds: unknown[] = Body.list(Body.get(recount.body, 'rounds'));
    expect(rounds[1]).toMatchObject({ number: 2, items: 1 });
    const firstCounter: AuthenticatedClient = zone(anaItems) === 'A' ? ana : beto;
    const secondCounter: AuthenticatedClient = firstCounter === ana ? beto : ana;
    expect(await work(firstCounter)).toHaveLength(0);
    const recountItems: unknown[] = await work(secondCounter);
    expect(recountItems).toHaveLength(1);
    await count(secondCounter, Body.text(recountItems[0], 'itemId'), '100').expect(204);
    const after: Response = await request(app.server())
      .get(api(`/${countId}/supervision`))
      .set('authorization', owner.bearer())
      .expect(200);
    const afterBody: unknown = after.body;
    expect(afterBody).toMatchObject({ exceeding: 0, differenceValue: '0.00' });
    const closed: Response = await request(app.server())
      .post(api(`/${countId}/close`))
      .set('authorization', owner.bearer())
      .expect(201);
    const closedBody: unknown = closed.body;
    expect(closedBody).toMatchObject({ status: 'CLOSED' });
  });
});
