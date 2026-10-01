import request, { Response } from 'supertest';
import { AuthenticatedClient, TestApp } from '../../../../testing/test-app';

class Field {
  public static text(body: unknown, key: string): string {
    const value: unknown = typeof body === 'object' && body !== null && key in body ? Reflect.get(body, key) : null;
    if (typeof value !== 'string') {
      throw new Error(`Falta el campo ${key}`);
    }
    return value;
  }
}

describe('Proyectos (e2e)', () => {
  let app: TestApp;
  let owner: AuthenticatedClient;
  let guest: AuthenticatedClient;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.start(null);
    owner = await app.register('duena@demo.test', 'Dueña Demo');
    guest = await app.register('invitado@demo.test', 'Invitado Demo');
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  const createProject = async (name: string, moduleType: string): Promise<string> => {
    const response: Response = await request(app.server())
      .post('/api/v1/projects')
      .set('authorization', owner.bearer())
      .send({ name, description: 'Proyecto ficticio', moduleType })
      .expect(201);
    const body: unknown = response.body;
    expect(body).toMatchObject({ name, moduleType, myRole: 'OWNER', memberCount: 1 });
    return Field.text(body, 'id');
  };

  it('crea y lista proyectos; un no miembro recibe 404', async (): Promise<void> => {
    const id: string = await createProject('Cierre anual ficticio', 'REPORTS');
    const list: Response = await request(app.server()).get('/api/v1/projects').set('authorization', owner.bearer()).expect(200);
    const listBody: unknown = list.body;
    expect(listBody).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    await request(app.server()).get(`/api/v1/projects/${id}`).set('authorization', guest.bearer()).expect(404);
    await request(app.server())
      .post('/api/v1/projects')
      .set('authorization', owner.bearer())
      .send({ name: 'x', description: '', moduleType: 'REPORTS' })
      .expect(400);
  });

  it('agrega miembros con roles del módulo y controla permisos', async (): Promise<void> => {
    const id: string = await createProject('Reportes con miembros', 'REPORTS');
    await request(app.server())
      .post(`/api/v1/projects/${id}/members`)
      .set('authorization', owner.bearer())
      .send({ email: 'invitado@demo.test', role: 'COUNTER' })
      .expect(400);
    await request(app.server())
      .post(`/api/v1/projects/${id}/members`)
      .set('authorization', owner.bearer())
      .send({ email: 'invitado@demo.test', role: 'VIEWER' })
      .expect(204);
    const members: Response = await request(app.server())
      .get(`/api/v1/projects/${id}/members`)
      .set('authorization', guest.bearer())
      .expect(200);
    const membersBody: unknown = members.body;
    expect(membersBody).toHaveLength(2);
    const asGuest: Response = await request(app.server())
      .patch(`/api/v1/projects/${id}`)
      .set('authorization', guest.bearer())
      .send({ name: 'Intento', description: '' })
      .expect(403);
    const deniedBody: unknown = asGuest.body;
    expect(deniedBody).toMatchObject({ code: 'PERMISSION_DENIED' });
    await request(app.server())
      .patch(`/api/v1/projects/${id}/members/${guest.userId}`)
      .set('authorization', owner.bearer())
      .send({ role: 'ANALYST' })
      .expect(204);
    await request(app.server())
      .delete(`/api/v1/projects/${id}/members/${owner.userId}`)
      .set('authorization', owner.bearer())
      .expect(400);
    await request(app.server())
      .delete(`/api/v1/projects/${id}/members/${guest.userId}`)
      .set('authorization', guest.bearer())
      .expect(204);
    await request(app.server()).get(`/api/v1/projects/${id}`).set('authorization', guest.bearer()).expect(404);
  });

  it('se une con un vínculo de un solo uso y luego queda agotado', async (): Promise<void> => {
    const id: string = await createProject('Toma física ficticia', 'INVENTORY');
    const created: Response = await request(app.server())
      .post(`/api/v1/projects/${id}/share-links`)
      .set('authorization', owner.bearer())
      .send({ role: 'COUNTER', expiresInDays: 7, maxUses: 1 })
      .expect(201);
    const createdBody: unknown = created.body;
    const token: string = Field.text(createdBody, 'token');
    const joined: Response = await request(app.server())
      .post('/api/v1/projects/join')
      .set('authorization', guest.bearer())
      .send({ token })
      .expect(201);
    const joinedBody: unknown = joined.body;
    expect(joinedBody).toMatchObject({ id, myRole: 'COUNTER', myPermissions: ['INVENTORY_COUNT'] });
    const third: AuthenticatedClient = await app.register('tercero@demo.test', 'Tercero');
    await request(app.server()).post('/api/v1/projects/join').set('authorization', third.bearer()).send({ token }).expect(400);
    const links: Response = await request(app.server())
      .get(`/api/v1/projects/${id}/share-links`)
      .set('authorization', owner.bearer())
      .expect(200);
    const linksBody: unknown = links.body;
    expect(linksBody).toEqual([expect.objectContaining({ uses: 1, active: false, role: 'COUNTER' })]);
  });
});
