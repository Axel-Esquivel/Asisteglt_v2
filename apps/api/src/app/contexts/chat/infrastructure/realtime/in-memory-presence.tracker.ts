import { Injectable } from '@nestjs/common';
import { EntityId } from '@asisteglt/shared-kernel';
import { PresenceTracker } from '../../domain/ports';

/**
 * Presencia en un solo nodo (servidor local o una instancia). Con varias instancias se
 * sustituye por una implementación en Redis con el mismo contrato.
 */
@Injectable()
export class InMemoryPresenceTracker extends PresenceTracker {
  private readonly sockets: Map<string, Set<string>> = new Map<string, Set<string>>();

  public override markOnline(userId: EntityId, socketId: string): Promise<boolean> {
    const key: string = userId.toString();
    const current: Set<string> = this.sockets.get(key) ?? new Set<string>();
    const wasOffline: boolean = current.size === 0;
    current.add(socketId);
    this.sockets.set(key, current);
    return Promise.resolve(wasOffline);
  }

  public override markOffline(userId: EntityId, socketId: string): Promise<boolean> {
    const key: string = userId.toString();
    const current: Set<string> = this.sockets.get(key) ?? new Set<string>();
    current.delete(socketId);
    if (current.size === 0) {
      this.sockets.delete(key);
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  public override onlineUsers(): Promise<string[]> {
    return Promise.resolve([...this.sockets.keys()]);
  }
}
