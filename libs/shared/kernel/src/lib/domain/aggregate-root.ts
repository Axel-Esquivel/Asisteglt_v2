import { DomainEvent } from './domain-event';
import { Entity } from './entity';

/** Raíz de agregado: frontera de consistencia que acumula eventos de dominio. */
export abstract class AggregateRoot extends Entity {
  private pendingEvents: DomainEvent[] = [];

  public pullDomainEvents(): DomainEvent[] {
    const events: DomainEvent[] = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  protected record(event: DomainEvent): void {
    this.pendingEvents.push(event);
  }
}
