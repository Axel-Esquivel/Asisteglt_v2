import request, { Response } from 'supertest';
import { AuthenticatedClient, TestApp } from '../../../../testing/test-app';
import { DataRecordRepository, DataRecordSnapshot } from '../../reports/domain/ports';

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
  it('registra novedades, reasigna pendientes y valoriza el cierre con Decimal', async (): Promise<void> => {
    const created: Response = await request(app.server())
      .post(api(''))
      .set('authorization', owner.bearer())
      .send({
        name: 'Bodega norte',
        warehouse: 'Norte',
        toleranceKind: 'ABSOLUTE',
        toleranceValue: '0',
        maxRounds: 2,
      })
      .expect(201);
    const countId: string = Body.text(created.body, 'id');
    const item = (
      sku: string,
      location: string,
      expected: string,
      cost: string | null,
    ): Record<string, string | null> => ({
      sku,
      description: `Artículo ${sku}`,
      unit: 'u',
      location,
      expectedQuantity: expected,
      unitCost: cost,
    });
    await request(app.server())
      .put(api(`/${countId}/items`))
      .set('authorization', owner.bearer())
      .send({
        items: [
          item('N-001', 'A-01', '100', '0.50'),
          item('N-002', 'A-02', '40', '0.25'),
          item('N-003', 'B-01', '10', null),
          item('N-004', 'B-02', '7', '1'),
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
    await request(app.server())
      .post(api(`/${countId}/start`))
      .set('authorization', owner.bearer())
      .expect(201);

    const reassign = (fromUserId: string, toUserId: string): request.Test =>
      request(app.server())
        .post(api(`/${countId}/reassign`))
        .set('authorization', owner.bearer())
        .send({ fromUserId, toUserId });
    await reassign(beto.userId, beto.userId).expect(400);
    await reassign(beto.userId, owner.userId).expect(400);
    const moved: Response = await reassign(beto.userId, ana.userId).expect(201);
    const assignments: unknown[] = Body.list(
      Body.get(Body.list(Body.get(moved.body, 'rounds'))[0], 'assignments'),
    );
    expect(assignments.map((a: unknown): unknown => Body.get(a, 'assigned')).sort()).toEqual([0, 4]);

    const work: Response = await request(app.server())
      .get(api(`/${countId}/my-work`))
      .set('authorization', ana.bearer())
      .expect(200);
    const items: unknown[] = Body.list(Body.get(work.body, 'items'));
    expect(items).toHaveLength(4);
    const idOf = (sku: string): string =>
      items
        .filter((i: unknown): boolean => Body.text(i, 'sku') === sku)
        .map((i: unknown): string => Body.text(i, 'itemId'))[0] ?? '';
    const record = (sku: string, quantity: string, condition: string): request.Test =>
      request(app.server())
        .post(api(`/${countId}/entries`))
        .set('authorization', ana.bearer())
        .send({ itemId: idOf(sku), quantity, comment: condition === 'OK' ? '' : 'Revisar', condition });
    await record('N-001', '100', 'OK').expect(204);
    await record('N-002', '5', 'NOT_FOUND').expect(204);
    await record('N-003', '10', 'DAMAGED').expect(204);
    await record('N-004', '7', 'OK').expect(204);

    // Evidencia: una foto PNG (FICTICIA: solo la firma del formato) para el ítem dañado
    const png: Buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const photo = (client: AuthenticatedClient, content: Buffer, name: string): request.Test =>
      request(app.server())
        .post(api(`/${countId}/items/${idOf('N-003')}/photos`))
        .set('authorization', client.bearer())
        .attach('photo', content, name);
    await photo(ana, Buffer.from('no es una imagen'), 'nota.txt').expect(400);
    const uploaded: Response = await photo(ana, png, 'danio.png').expect(201);
    const photoId: string = Body.text(uploaded.body, 'id');
    const listed: Response = await request(app.server())
      .get(api(`/${countId}/items/${idOf('N-003')}/photos`))
      .set('authorization', owner.bearer())
      .expect(200);
    expect(Body.list(listed.body)).toHaveLength(1);
    const file: Response = await request(app.server())
      .get(api(`/${countId}/photos/${photoId}`))
      .set('authorization', owner.bearer())
      .buffer(true)
      .expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    await request(app.server())
      .get(api(`/${countId}/photos/${photoId}`))
      .set('authorization', beto.bearer())
      .expect(404);

    const supervision: Response = await request(app.server())
      .get(api(`/${countId}/supervision`))
      .set('authorization', owner.bearer())
      .expect(200);
    const supervisionBody: unknown = supervision.body;
    expect(supervisionBody).toMatchObject({
      counted: 4,
      issues: 2,
      differenceValue: '-10.00',
      expectedValue: '67.00',
      countedValue: '57.00',
      uncountedValue: '0.00',
    });
    expect(Body.list(Body.get(supervision.body, 'items'))).toContainEqual(
      expect.objectContaining({ sku: 'N-002', counted: '0', condition: 'NOT_FOUND', comment: 'Revisar' }),
    );
    expect(Body.list(Body.get(supervision.body, 'items'))).toContainEqual(
      expect.objectContaining({ sku: 'N-003', photos: 1 }),
    );

    await request(app.server())
      .post(api(`/${countId}/rounds/close`))
      .set('authorization', owner.bearer())
      .expect(201);
    const recount: Response = await request(app.server())
      .post(api(`/${countId}/recount`))
      .set('authorization', owner.bearer())
      .expect(201);
    expect(Body.list(Body.get(recount.body, 'rounds'))[1]).toMatchObject({ number: 2, items: 2 });

    // Paquete: se exporta y se importa como toma cerrada con los mismos resultados
    const exported: Response = await request(app.server())
      .get(api(`/${countId}/package`))
      .set('authorization', owner.bearer())
      .expect(200);
    const pkg: unknown = exported.body;
    expect(pkg).toMatchObject({ format: 'asisteglt.inventory-count', version: 1 });
    await request(app.server())
      .post(api('/import'))
      .set('authorization', owner.bearer())
      .send({ format: 'otro', version: 1 })
      .expect(400);
    await request(app.server()).post(api('/import')).set('authorization', ana.bearer()).send(pkg).expect(403);
    const imported: Response = await request(app.server())
      .post(api('/import'))
      .set('authorization', owner.bearer())
      .send(pkg)
      .expect(201);
    expect(imported.body).toMatchObject({ name: 'Bodega norte (importada)', status: 'CLOSED', items: 4 });
    const importedSupervision: Response = await request(app.server())
      .get(api(`/${Body.text(imported.body, 'id')}/supervision`))
      .set('authorization', owner.bearer())
      .expect(200);
    expect(importedSupervision.body).toMatchObject({
      counted: 4,
      issues: 2,
      expectedValue: '67.00',
      countedValue: '57.00',
      differenceValue: '-10.00',
    });
  });
  it('carga los ítems desde datos cargados con el mapeo de encabezados por nombre', async (): Promise<void> => {
    const field = async (
      label: string,
      role: string,
      dataType: string,
      nature: string | null,
    ): Promise<string> => {
      const created: Response = await request(app.server())
        .post(`/api/v1/projects/${projectId}/catalog/fields`)
        .set('authorization', owner.bearer())
        .send({
          label,
          origin: 'IMPORTED',
          role,
          dataType,
          nature,
          aggregation: null,
          describes: null,
          weightField: null,
        })
        .expect(201);
      return Body.text(created.body, 'key');
    };
    const sku: string = await field('Código de producto', 'IDENTIFIER', 'TEXT', null);
    const name: string = await field('Descripción del producto', 'DATA', 'TEXT', null);
    const location: string = await field('Ubicación', 'DATA', 'TEXT', null);
    const stock: string = await field('Existencia', 'DATA', 'INTEGER', 'QUANTITY');
    const cost: string = await field('Costo unitario', 'DATA', 'DECIMAL', 'UNIT_PRICE');
    const amount: string = await field('Valor en libros', 'DATA', 'DECIMAL', 'AMOUNT');
    const x: string = await field('Pasillo X', 'DATA', 'DECIMAL', 'DESCRIPTIVE');
    const record = (line: number, values: Record<string, string | null>): DataRecordSnapshot => ({
      id: `rec-${String(line)}`,
      projectId,
      loadId: 'carga-ficticia',
      profileId: 'perfil-ficticio',
      period: '2026-09',
      organizationId: 'org',
      countryId: 'pais',
      currency: 'GTQ',
      companyId: 'cia',
      enterpriseId: null,
      branchId: null,
      line,
      values,
    });
    await app.app.get(DataRecordRepository).insertMany([
      record(1, {
        [sku]: 'D-001',
        [name]: 'Producto uno',
        [location]: 'A-01',
        [stock]: '12',
        [cost]: '2.5',
        [amount]: '30',
        [x]: '1.5',
      }),
      record(2, {
        [sku]: 'D-002',
        [name]: 'Producto dos',
        [location]: 'B-01',
        [stock]: null,
        [cost]: null,
        [amount]: '0',
        [x]: '8',
      }),
      record(3, {
        [sku]: null,
        [name]: 'Fila sin código',
        [location]: 'C-01',
        [stock]: '1',
        [cost]: null,
        [amount]: '0',
        [x]: null,
      }),
    ]);
    const created: Response = await request(app.server())
      .post(api(''))
      .set('authorization', owner.bearer())
      .send({
        name: 'Desde datos',
        warehouse: 'Central',
        toleranceKind: 'ABSOLUTE',
        toleranceValue: '0',
        maxRounds: 2,
      })
      .expect(201);
    const countId: string = Body.text(created.body, 'id');
    const mapping = {
      sku,
      description: name,
      unit: null,
      location,
      expected: stock,
      unitCost: cost,
      x,
      y: null,
    };
    const load = (body: Record<string, unknown>): request.Test =>
      request(app.server())
        .post(api(`/${countId}/items/from-data`))
        .set('authorization', owner.bearer())
        .send(body);
    const mismatch: Response = await load({
      profileId: null,
      period: '2026-09',
      companyId: null,
      mapping: { ...mapping, expected: amount },
    }).expect(400);
    expect(mismatch.body).toMatchObject({ code: 'FIELD_NATURE_MISMATCH' });
    await load({
      profileId: null,
      period: '2026-09',
      companyId: null,
      mapping: { ...mapping, sku: cost },
    }).expect(400);
    await load({ profileId: null, period: '2026-08', companyId: null, mapping }).expect(400);
    const loaded: Response = await load({
      profileId: null,
      period: '2026-09',
      companyId: null,
      mapping,
    }).expect(201);
    expect(loaded.body).toMatchObject({ items: 2 });
    await request(app.server())
      .post(api(`/${countId}/items/from-data`))
      .set('authorization', ana.bearer())
      .send({ profileId: null, period: '2026-09', companyId: null, mapping })
      .expect(403);
  });
});
