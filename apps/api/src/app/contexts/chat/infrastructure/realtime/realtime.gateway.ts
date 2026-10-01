import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import { ChatMessageResponse, PresenceChangedEvent, RealtimeEvent } from '@asisteglt/shared-contracts';
import { EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { Server, Socket } from 'socket.io';
import { AccountService } from '../../../iam/application/account.use-cases';
import { AccessTokenIssuer, AuthenticatedPrincipal } from '../../../iam/domain/ports';
import { EveryoneAudience, PresenceTracker, RealtimeAudience, RealtimeEventPublisher, UsersAudience } from '../../domain/ports';

/** Ruta del endpoint Socket.IO (mismo origen que la API; el proxy la reenvía). */
export const REALTIME_PATH: string = '/api/v1/realtime';

/**
 * Canal en tiempo real. Autentica el handshake con el access token (`auth.token`), une cada
 * socket a la sala de su usuario y a la sala común, y publica los eventos del dominio.
 */
@WebSocketGateway({ path: REALTIME_PATH })
export class RealtimeGateway
  extends RealtimeEventPublisher
  implements OnGatewayInit<Server>, OnGatewayConnection<Socket>, OnGatewayDisconnect<Socket>
{
  private readonly logger: Logger = new Logger(RealtimeGateway.name);
  private readonly principals: Map<string, EntityId> = new Map<string, EntityId>();
  private server: Nullable<Server> = null;

  public constructor(
    private readonly tokens: AccessTokenIssuer,
    private readonly accounts: AccountService,
    private readonly presence: PresenceTracker,
  ) {
    super();
  }

  public afterInit(server: Server): void {
    this.server = server;
  }

  public async handleConnection(socket: Socket): Promise<void> {
    const principal: Nullable<AuthenticatedPrincipal> = await this.authenticate(socket);
    if (principal === null) {
      socket.emit('auth:error', { code: 'UNAUTHENTICATED' });
      socket.disconnect(true);
      return;
    }
    this.principals.set(socket.id, principal.userId);
    await socket.join([UsersAudience.room(principal.userId.toString()), EveryoneAudience.ROOM]);
    if (await this.presence.markOnline(principal.userId, socket.id)) {
      this.presenceChanged({ userId: principal.userId.toString(), online: true });
    }
  }

  public async handleDisconnect(socket: Socket): Promise<void> {
    const userId: Nullable<EntityId> = this.principals.get(socket.id) ?? null;
    this.principals.delete(socket.id);
    if (userId !== null && (await this.presence.markOffline(userId, socket.id))) {
      this.presenceChanged({ userId: userId.toString(), online: false });
    }
  }

  public override chatMessage(audience: RealtimeAudience, message: ChatMessageResponse, updated: boolean): void {
    const rooms: string[] = audience.rooms();
    if (this.server !== null && rooms.length > 0) {
      this.server.to(rooms).emit(updated ? RealtimeEvent.CHAT_MESSAGE_UPDATED : RealtimeEvent.CHAT_MESSAGE, message);
    }
  }

  public override presenceChanged(event: PresenceChangedEvent): void {
    if (this.server !== null) {
      this.server.to(EveryoneAudience.ROOM).emit(RealtimeEvent.PRESENCE_CHANGED, event);
    }
  }

  public override publish(audience: RealtimeAudience, event: RealtimeEvent, payload: object): void {
    const rooms: string[] = audience.rooms();
    if (this.server !== null && rooms.length > 0) {
      this.server.to(rooms).emit(event, payload);
    }
  }

  private async authenticate(socket: Socket): Promise<Nullable<AuthenticatedPrincipal>> {
    const auth: unknown = socket.handshake.auth;
    const token: unknown = typeof auth === 'object' && auth !== null && 'token' in auth ? auth.token : null;
    if (typeof token !== 'string' || token.length === 0) {
      return null;
    }
    try {
      const verified: Result<AuthenticatedPrincipal> = await this.tokens.verify(token);
      if (!verified.isOk()) {
        return null;
      }
      const principal: AuthenticatedPrincipal = verified.unwrap();
      return (await this.accounts.isSessionActive(principal.sessionId)) ? principal : null;
    } catch (error: unknown) {
      this.logger.warn(`Handshake rechazado: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
