import { Result } from '../core/result';
import { ValidationError } from '../errors/domain-error';
import { ValueObject } from './value-object';

/** Identificador de entidad: UUID v4 o ObjectId de MongoDB (24 hex). */
export class EntityId extends ValueObject {
  private static readonly UUID_PATTERN: RegExp =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly OBJECT_ID_PATTERN: RegExp = /^[0-9a-f]{24}$/i;

  private constructor(private readonly value: string) {
    super();
  }

  public static generate(): EntityId {
    return new EntityId(globalThis.crypto.randomUUID());
  }

  public static fromString(raw: string): Result<EntityId> {
    const value: string = raw.trim().toLowerCase();
    if (!EntityId.UUID_PATTERN.test(value) && !EntityId.OBJECT_ID_PATTERN.test(value)) {
      return Result.fail(new ValidationError('INVALID_ENTITY_ID', `Identificador inválido: ${raw}`));
    }
    return Result.ok(new EntityId(value));
  }

  public override toString(): string {
    return this.value;
  }

  protected override equalityKey(): string {
    return this.value;
  }
}
