import { EntityId } from './entity-id';

/** Entidad con identidad propia; dos entidades son iguales si comparten id y tipo. */
export abstract class Entity {
  protected constructor(protected readonly id: EntityId) {}

  public getId(): EntityId {
    return this.id;
  }

  public equals(other: Entity): boolean {
    return other.constructor === this.constructor && other.id.equals(this.id);
  }
}
