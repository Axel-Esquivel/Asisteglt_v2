import { Injectable } from '@nestjs/common';
import { Email, EntityId, Optional } from '@asisteglt/shared-kernel';
import { UserRepository } from '../domain/ports';
import { User } from '../domain/user';

/** Consulta de usuarios para otros contextos (miembros de proyecto, chat). */
@Injectable()
export class UserDirectory {
  private static readonly MAX_RESULTS: number = 20;

  public constructor(private readonly users: UserRepository) {}

  public async search(text: string): Promise<User[]> {
    return text.trim().length < 2 ? [] : this.users.search(text, UserDirectory.MAX_RESULTS);
  }

  public findById(id: EntityId): Promise<Optional<User>> {
    return this.users.findById(id);
  }

  public findByEmail(email: Email): Promise<Optional<User>> {
    return this.users.findByEmail(email);
  }

  public findMany(ids: ReadonlyArray<EntityId>): Promise<User[]> {
    return this.users.findManyByIds(ids);
  }
}
