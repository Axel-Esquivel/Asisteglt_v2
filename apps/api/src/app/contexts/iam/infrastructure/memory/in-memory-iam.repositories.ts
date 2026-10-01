import { Injectable } from '@nestjs/common';
import { Email, EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { InMemoryCollection } from '../../../../common/persistence/in-memory-collection';
import { SessionRepository, UserRepository } from '../../domain/ports';
import { Session, SessionSnapshot } from '../../domain/session';
import { User, UserSnapshot } from '../../domain/user';

@Injectable()
export class InMemoryUserRepository extends UserRepository {
  private readonly collection: InMemoryCollection<UserSnapshot> = new InMemoryCollection<UserSnapshot>();

  public override findById(id: EntityId): Promise<Optional<User>> {
    return Promise.resolve(this.restore(this.collection.get(id.toString())));
  }

  public override findByEmail(email: Email): Promise<Optional<User>> {
    return Promise.resolve(
      this.restore(this.collection.find((u: UserSnapshot): boolean => u.email === email.toString())),
    );
  }

  public override findManyByIds(ids: ReadonlyArray<EntityId>): Promise<User[]> {
    const wanted: Set<string> = new Set<string>(ids.map((id: EntityId): string => id.toString()));
    return Promise.resolve(
      this.collection.filter((u: UserSnapshot): boolean => wanted.has(u.id)).map(User.restore),
    );
  }

  public override search(text: string, limit: number): Promise<User[]> {
    const needle: string = text.trim().toLowerCase();
    return Promise.resolve(
      this.collection
        .filter(
          (u: UserSnapshot): boolean =>
            u.email.includes(needle) || u.displayName.toLowerCase().includes(needle),
        )
        .slice(0, limit)
        .map(User.restore),
    );
  }

  public override save(user: User): Promise<void> {
    this.collection.put(user.toSnapshot());
    return Promise.resolve();
  }

  private restore(snapshot: Nullable<UserSnapshot>): Optional<User> {
    return Optional.fromNullable(snapshot).map(User.restore);
  }
}

@Injectable()
export class InMemorySessionRepository extends SessionRepository {
  private readonly collection: InMemoryCollection<SessionSnapshot> =
    new InMemoryCollection<SessionSnapshot>();

  public override findById(id: EntityId): Promise<Optional<Session>> {
    return Promise.resolve(Optional.fromNullable(this.collection.get(id.toString())).map(Session.restore));
  }

  public override findByAnyTokenHash(hash: string): Promise<Optional<Session>> {
    const found: Nullable<SessionSnapshot> = this.collection.find(
      (s: SessionSnapshot): boolean => s.refreshTokenHash === hash || s.previousTokenHashes.includes(hash),
    );
    return Promise.resolve(Optional.fromNullable(found).map(Session.restore));
  }

  public override findByUser(userId: EntityId): Promise<Session[]> {
    return Promise.resolve(
      this.collection
        .filter((s: SessionSnapshot): boolean => s.userId === userId.toString())
        .map(Session.restore),
    );
  }

  public override save(session: Session): Promise<void> {
    this.collection.put(session.toSnapshot());
    return Promise.resolve();
  }
}
