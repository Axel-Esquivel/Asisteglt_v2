import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, WritableSignal, effect, inject, signal } from '@angular/core';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { Observable, Subscriber } from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { AuthSession } from '../auth/auth-session';
import { TokenStore } from '../auth/token-store';
import { ApiConfig } from '../http/api-config';
import { Decoder } from '../http/decoder';

/**
 * Conexión Socket.IO única de la aplicación. Se abre al autenticarse, se cierra al salir y
 * renueva el access token cuando el servidor rechaza el handshake.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeClient {
  private readonly session: AuthSession = inject(AuthSession);
  private readonly tokens: TokenStore = inject(TokenStore);
  private readonly config: ApiConfig = inject(ApiConfig);
  private readonly document: Document = inject(DOCUMENT);
  private readonly state: WritableSignal<boolean> = signal<boolean>(false);
  private socket: Nullable<Socket> = null;
  private retriedAuth: boolean = false;

  public readonly connected: Signal<boolean> = this.state.asReadonly();

  public constructor() {
    effect((): void => {
      if (this.session.isAuthenticated()) {
        this.open();
      } else {
        this.close();
      }
    });
  }

  /** Eventos del servidor ya validados; los que no pasan el decoder se descartan. */
  public events<T>(event: string, decoder: Decoder<T>): Observable<T> {
    return new Observable<T>((subscriber: Subscriber<T>): (() => void) => {
      const handler = (payload: unknown): void => {
        const decoded: Result<T> = decoder.decode(payload);
        if (decoded.isOk()) {
          subscriber.next(decoded.unwrap());
        }
      };
      const socket: Socket = this.open();
      socket.on(event, handler);
      return (): void => {
        socket.off(event, handler);
      };
    });
  }

  private open(): Socket {
    if (this.socket !== null) {
      return this.socket;
    }
    const endpoint: URL = new URL(this.config.url('realtime'), this.document.location.origin);
    const socket: Socket = io(endpoint.origin, {
      path: endpoint.pathname,
      transports: ['websocket', 'polling'],
      auth: (callback: (data: object) => void): void => callback({ token: this.tokens.current() ?? '' }),
    });
    socket.on('connect', (): void => {
      this.retriedAuth = false;
      this.state.set(true);
    });
    socket.on('disconnect', (reason: string): void => {
      this.state.set(false);
      if (reason === 'io server disconnect') {
        this.reauthenticate(socket).catch((): void => {
          // Sin sesión válida: el guard llevará al login en la siguiente navegación.
        });
      }
    });
    this.socket = socket;
    return socket;
  }

  private async reauthenticate(socket: Socket): Promise<void> {
    if (this.retriedAuth || !this.session.isAuthenticated()) {
      return;
    }
    this.retriedAuth = true;
    if (await this.session.refresh()) {
      socket.connect();
    }
  }

  private close(): void {
    if (this.socket !== null) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.state.set(false);
    }
  }
}
