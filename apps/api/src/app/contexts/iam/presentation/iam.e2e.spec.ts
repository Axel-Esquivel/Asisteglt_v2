import request, { Response } from 'supertest';
import { SecurityAuditEntry, SecurityEvent } from '../../../common/security/security-audit-log';
import { AuthenticatedClient, TestApp } from '../../../../testing/test-app';

describe('Identidad (e2e)', () => {
  let app: TestApp;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.start(null);
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('registra, consulta el perfil y rechaza correos duplicados', async (): Promise<void> => {
    const client: AuthenticatedClient = await app.register('ana@demo.test', 'Ana Demo');
    expect(client.refreshCookie).toMatch(/^asisteglt_rt=/);
    const me: Response = await request(app.server())
      .get('/api/v1/auth/me')
      .set('authorization', client.bearer())
      .expect(200);
    const body: unknown = me.body;
    expect(body).toMatchObject({ email: 'ana@demo.test', displayName: 'Ana Demo' });
    await request(app.server())
      .post('/api/v1/auth/register')
      .send({ email: 'ANA@demo.test', password: 'ClaveSegura2026', displayName: 'Otra' })
      .expect(409);
  });

  it('rechaza contraseñas débiles', async (): Promise<void> => {
    const response: Response = await request(app.server())
      .post('/api/v1/auth/register')
      .send({ email: 'debil@demo.test', password: 'corta', displayName: 'Débil' })
      .expect(400);
    const body: unknown = response.body;
    expect(body).toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('rota el refresh token y cierra la sesión si se reutiliza uno anterior', async (): Promise<void> => {
    const client: AuthenticatedClient = await app.register('rotacion@demo.test', 'Rotación');
    const first: Response = await request(app.server())
      .post('/api/v1/auth/refresh')
      .set('cookie', client.refreshCookie)
      .expect(200);
    const rotated: AuthenticatedClient = AuthenticatedClient.from(first);
    expect(rotated.refreshCookie).not.toBe(client.refreshCookie);
    const reused: Response = await request(app.server())
      .post('/api/v1/auth/refresh')
      .set('cookie', client.refreshCookie)
      .expect(401);
    const reusedBody: unknown = reused.body;
    expect(reusedBody).toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    await request(app.server()).post('/api/v1/auth/refresh').set('cookie', rotated.refreshCookie).expect(401);
    await request(app.server()).get('/api/v1/auth/me').set('authorization', rotated.bearer()).expect(401);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async (): Promise<void> => {
    await app.register('bloqueo@demo.test', 'Bloqueo');
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await request(app.server())
        .post('/api/v1/auth/login')
        .send({ email: 'bloqueo@demo.test', password: 'Incorrecta2026x' })
        .expect(401);
    }
    const locked: Response = await request(app.server())
      .post('/api/v1/auth/login')
      .send({ email: 'bloqueo@demo.test', password: 'Incorrecta2026x' })
      .expect(401);
    const lockedBody: unknown = locked.body;
    expect(lockedBody).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    await request(app.server())
      .post('/api/v1/auth/login')
      .send({ email: 'bloqueo@demo.test', password: 'ClaveSegura2026' })
      .expect(401);
    expect(app.audit.events()).toEqual(
      expect.arrayContaining([
        SecurityEvent.LOGIN_FAILED,
        SecurityEvent.ACCOUNT_LOCKED,
        SecurityEvent.LOGIN_WHILE_LOCKED,
      ]),
    );
  });

  it('audita intentos con cuentas inexistentes sin guardar el correo en claro', async (): Promise<void> => {
    await request(app.server())
      .post('/api/v1/auth/login')
      .send({ email: 'Nadie@Demo.test', password: 'Incorrecta2026x' })
      .expect(401);
    const failed: SecurityAuditEntry[] = app.audit
      .all()
      .filter((entry: SecurityAuditEntry): boolean => entry.detail === 'unknown-account');
    expect(failed.map((entry: SecurityAuditEntry): string | null => entry.subject)).toEqual([
      SecurityAuditEntry.fingerprint('nadie@demo.test'),
    ]);
    expect(JSON.stringify(app.audit.all())).not.toContain('nadie@demo');
  });

  it('cambia la contraseña, cierra las otras sesiones y lista las activas', async (): Promise<void> => {
    const first: AuthenticatedClient = await app.register('cambio@demo.test', 'Cambio');
    const loginResponse: Response = await request(app.server())
      .post('/api/v1/auth/login')
      .send({ email: 'cambio@demo.test', password: 'ClaveSegura2026' })
      .expect(200);
    const second: AuthenticatedClient = AuthenticatedClient.from(loginResponse);
    const before: Response = await request(app.server())
      .get('/api/v1/users/me/sessions')
      .set('authorization', second.bearer())
      .expect(200);
    expect(Array.isArray(before.body) ? before.body.length : 0).toBe(2);
    await request(app.server())
      .post('/api/v1/users/me/password')
      .set('authorization', second.bearer())
      .send({ currentPassword: 'ClaveSegura2026', newPassword: 'NuevaClave2026segura' })
      .expect(204);
    await request(app.server()).get('/api/v1/auth/me').set('authorization', first.bearer()).expect(401);
    await request(app.server()).get('/api/v1/auth/me').set('authorization', second.bearer()).expect(200);
    await request(app.server())
      .post('/api/v1/auth/login')
      .send({ email: 'cambio@demo.test', password: 'NuevaClave2026segura' })
      .expect(200);
  });

  it('cierra sesión e invalida el refresh token', async (): Promise<void> => {
    const client: AuthenticatedClient = await app.register('salida@demo.test', 'Salida');
    await request(app.server()).post('/api/v1/auth/logout').set('cookie', client.refreshCookie).expect(204);
    await request(app.server()).post('/api/v1/auth/refresh').set('cookie', client.refreshCookie).expect(401);
  });
});

describe('Límite de intentos por IP (e2e)', () => {
  let app: TestApp;

  beforeAll(async (): Promise<void> => {
    app = await TestApp.startWith(null, { AUTH_RATE_LIMIT_PER_MINUTE: '3' });
  });

  afterAll(async (): Promise<void> => {
    await app.stop();
  });

  it('responde 429 con Retry-After al superar el límite de login y lo audita una vez', async (): Promise<void> => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await request(app.server())
        .post('/api/v1/auth/login')
        .send({ email: `rafaga${String(attempt)}@demo.test`, password: 'Incorrecta2026x' })
        .expect(401);
    }
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const limited: Response = await request(app.server())
        .post('/api/v1/auth/login')
        .send({ email: 'rafaga@demo.test', password: 'Incorrecta2026x' })
        .expect(429);
      const body: unknown = limited.body;
      expect(body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    }
    const limitedEvents: SecurityEvent[] = app.audit
      .events()
      .filter((event: SecurityEvent): boolean => event === SecurityEvent.RATE_LIMITED);
    expect(limitedEvents).toHaveLength(1);
    await request(app.server()).get('/api/v1/health').expect(200);
  });
});
