import { EntityId } from './entity-id';

/** Hecho de negocio ocurrido en un agregado; se publica después de persistir. */
export abstract class DomainEvent {
  protected constructor(
    public readonly aggregateId: EntityId,
    public readonly occurredAt: Date,
  ) {}

  public abstract eventName(): string;
}
