import 'reflect-metadata';
import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '@asisteglt/shared-kernel';
import request, { Response } from 'supertest';
import { AppBootstrapper } from '../app/app-bootstrapper';
import { AppModule } from '../app/app.module';
import { AppConfig, AppConfigLoader } from '../app/config/app-config';

/** Aplicación Nest completa en memoria (DATA_STORE=memory) para pruebas e2e. */
export class TestApp {
  private constructor(public readonly app: INestApplication<Server>) {}

  public static async start(clock: Clock | null): Promise<TestApp> {
    const config: AppConfig = AppConfigLoader.load({
      NODE_ENV: 'test',
      DATA_STORE: 'memory',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      REDIS_URL: 'redis://localhost:6379',
      APP_VERSION: '9.9.9',
      JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
    });
    const builder = Test.createTestingModule({ imports: [AppModule.forRoot(config)] });
    const moduleRef: TestingModule = await (clock === null
      ? builder
      : builder.overrideProvider(Clock).useValue(clock)
    ).compile();
    const app: INestApplication<Server> = moduleRef.createNestApplication<INestApplication<Server>>();
    AppBootstrapper.configure(app, config);
    await app.init();
    return new TestApp(app);
  }

  /** Escucha en un puerto libre (necesario para clientes Socket.IO) y devuelve la URL base. */
  public async listen(): Promise<string> {
    await this.app.listen(0, '127.0.0.1');
    const address: unknown = this.server().address();
    const port: unknown = typeof address === 'object' && address !== null && 'port' in address ? address.port : null;
    if (typeof port !== 'number') {
      throw new Error('No se pudo obtener el puerto de escucha');
    }
    return `http://127.0.0.1:${String(port)}`;
  }

  public server(): Server {
    return this.app.getHttpServer();
  }

  public async stop(): Promise<void> {
    await this.app.close();
  }

  /** Registra un usuario y devuelve su access token y la cookie de refresh. */
  public async register(email: string, displayName: string): Promise<AuthenticatedClient> {
    const response: Response = await request(this.server())
      .post('/api/v1/auth/register')
      .send({ email, password: 'ClaveSegura2026', displayName })
      .expect(201);
    return AuthenticatedClient.from(response);
  }
}

export class AuthenticatedClient {
  private constructor(
    public readonly accessToken: string,
    public readonly refreshCookie: string,
    public readonly userId: string,
  ) {}

  public static from(response: Response): AuthenticatedClient {
    const body: unknown = response.body;
    const token: unknown = typeof body === 'object' && body !== null && 'accessToken' in body ? body.accessToken : null;
    const user: unknown = typeof body === 'object' && body !== null && 'user' in body ? body.user : null;
    const userId: unknown = typeof user === 'object' && user !== null && 'id' in user ? user.id : null;
    const cookies: unknown = response.headers['set-cookie'];
    const cookie: string = Array.isArray(cookies) ? String(cookies[0] ?? '').split(';')[0] ?? '' : '';
    if (typeof token !== 'string' || typeof userId !== 'string') {
      throw new Error('Respuesta de autenticación inesperada');
    }
    return new AuthenticatedClient(token, cookie, userId);
  }

  public bearer(): string {
    return `Bearer ${this.accessToken}`;
  }
}
