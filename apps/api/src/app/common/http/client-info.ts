import { Request } from 'express';

/** Datos del cliente HTTP para auditar sesiones. */
export class ClientInfo {
  public static userAgent(request: Request): string {
    return (request.header('user-agent') ?? 'desconocido').slice(0, 300);
  }

  public static ipAddress(request: Request): string {
    return request.ip ?? request.socket.remoteAddress ?? 'desconocida';
  }
}
