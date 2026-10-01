import { RealtimeEvent } from '@asisteglt/shared-contracts';
import { Socket, io } from 'socket.io-client';
import request, { Response } from 'supertest';
import { AuthenticatedClient, TestApp } from '../../../../testing/test-app';
import { REALTIME_PATH } from '../infrastructure/realtime/realtime.gateway';

class Json {
  public static text(body: unknown, key: string): string {
    const value: unknown =
      typeof body === 'object' && body !== null && key in body ? Reflect.get(body, key) : null;
    if (typeof value !== 'string') {
      throw new Error(`Falta el campo ${key}`);
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

class RealtimeProbe {
  private constructor(private readonly socket: Socket) {}

  public static async connect(baseUrl: string, token: string): Promise<RealtimeProbe> {
    const socket: Socket = io(baseUrl, { path: REALTIME_PATH, auth: { token }, transports: ['websocket'] });
    await new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
      socket.once('connect', (): void => resolve());
      socket.once('connect_error', (error: Error): void => reject(error));
    });
    return new RealtimeProbe(socket);
  }

  public next(event: string): Promise<unknown> {
    return new Promise<unknown>((resolve: (value: unknown) => void): void => {
      this.socket.once(event, (payload: unknown): void => resolve(payload));
    });
  }

  public close(): void {
    this.socket.close();
  }
}

describe('Chat (e2e)', () => {
  let app: TestApp;
  let baseUrl: string;
  let ana: AuthenticatedClient;
  let beto: AuthenticatedClient;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.start(null);
    baseUrl = await app.listen();
    ana = await app.register('ana.chat@demo.test', 'Ana Chat');
    beto = await app.register('beto.chat@demo.test', 'Beto Chat');
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('entrega en tiempo real los mensajes directos y cuenta los no leídos', async (): Promise<void> => {
    const probe: RealtimeProbe = await RealtimeProbe.connect(baseUrl, beto.accessToken);
    const opened: Response = await request(app.server())
      .post('/api/v1/chat/direct')
      .set('authorization', ana.bearer())
      .send({ userId: beto.userId })
      .expect(201);
    const conversationBody: unknown = opened.body;
    expect(conversationBody).toMatchObject({
      type: 'DIRECT',
      title: 'Beto Chat',
      counterpartId: beto.userId,
    });
    const conversationId: string = Json.text(conversationBody, 'id');

    const received: Promise<unknown> = probe.next(RealtimeEvent.CHAT_MESSAGE);
    await request(app.server())
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('authorization', ana.bearer())
      .send({ text: '  Hola Beto  ' })
      .expect(201);
    expect(await received).toMatchObject({ conversationId, senderName: 'Ana Chat', text: 'Hola Beto' });

    const list: Response = await request(app.server())
      .get('/api/v1/chat/conversations')
      .set('authorization', beto.bearer())
      .expect(200);
    const conversations: unknown[] = Json.list(list.body);
    expect(conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'GLOBAL', title: 'Chat general' }),
        expect.objectContaining({ id: conversationId, title: 'Ana Chat', unread: 1 }),
      ]),
    );
    await request(app.server())
      .post(`/api/v1/chat/conversations/${conversationId}/read`)
      .set('authorization', beto.bearer())
      .expect(204);
    const after: Response = await request(app.server())
      .get('/api/v1/chat/conversations')
      .set('authorization', beto.bearer())
      .expect(200);
    expect(Json.list(after.body)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: conversationId, unread: 0 })]),
    );
    probe.close();
  });

  it('solo los miembros acceden al chat del proyecto', async (): Promise<void> => {
    const project: Response = await request(app.server())
      .post('/api/v1/projects')
      .set('authorization', ana.bearer())
      .send({ name: 'Proyecto con chat', description: '', moduleType: 'REPORTS' })
      .expect(201);
    const projectId: string = Json.text(project.body, 'id');
    const conversation: Response = await request(app.server())
      .get(`/api/v1/chat/projects/${projectId}`)
      .set('authorization', ana.bearer())
      .expect(200);
    const conversationId: string = Json.text(conversation.body, 'id');
    await request(app.server())
      .get(`/api/v1/chat/projects/${projectId}`)
      .set('authorization', beto.bearer())
      .expect(404);
    await request(app.server())
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('authorization', beto.bearer())
      .send({ text: 'Intruso' })
      .expect(404);
    const posted: Response = await request(app.server())
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('authorization', ana.bearer())
      .send({ text: 'Primer mensaje' })
      .expect(201);
    const messageId: string = Json.text(posted.body, 'id');
    await request(app.server())
      .patch(`/api/v1/chat/messages/${messageId}`)
      .set('authorization', beto.bearer())
      .send({ text: 'x' })
      .expect(404);
    const edited: Response = await request(app.server())
      .patch(`/api/v1/chat/messages/${messageId}`)
      .set('authorization', ana.bearer())
      .send({ text: 'Mensaje editado' })
      .expect(200);
    const editedBody: unknown = edited.body;
    expect(editedBody).toMatchObject({ text: 'Mensaje editado' });
    const history: Response = await request(app.server())
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('authorization', ana.bearer())
      .expect(200);
    expect(Json.list(history.body)).toHaveLength(1);
  });

  it('rechaza conexiones Socket.IO sin token válido', async (): Promise<void> => {
    const socket: Socket = io(baseUrl, {
      path: REALTIME_PATH,
      auth: { token: 'invalido' },
      transports: ['websocket'],
    });
    const reason: string = await new Promise<string>((resolve: (value: string) => void): void => {
      socket.once('disconnect', (why: string): void => resolve(why));
    });
    expect(reason).toBe('io server disconnect');
    socket.close();
  });
});
