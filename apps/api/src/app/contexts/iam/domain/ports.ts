import { Email, EntityId, Optional, Result } from '@asisteglt/shared-kernel';
import { PlainPassword } from './password-policy';
import { Session } from './session';
import { User } from './user';

export abstract class UserRepository {
  public abstract findById(id: EntityId): Promise<Optional<User>>;
  public abstract findByEmail(email: Email): Promise<Optional<User>>;
  public abstract findManyByIds(ids: ReadonlyArray<EntityId>): Promise<User[]>;
  public abstract search(text: string, limit: number): Promise<User[]>;
  public abstract save(user: User): Promise<void>;
}

export abstract class SessionRepository {
  public abstract findById(id: EntityId): Promise<Optional<Session>>;
  /** Busca por el token vigente o por uno ya usado (para detectar reutilización). */
  public abstract findByAnyTokenHash(hash: string): Promise<Optional<Session>>;
  public abstract findByUser(userId: EntityId): Promise<Session[]>;
  public abstract save(session: Session): Promise<void>;
}

export abstract class PasswordHasher {
  public abstract hash(password: PlainPassword): Promise<string>;
  public abstract verify(password: PlainPassword, hash: string): Promise<boolean>;
}

/** Identidad autenticada que viaja en el access token. */
export class AuthenticatedPrincipal {
  public constructor(
    public readonly userId: EntityId,
    public readonly sessionId: EntityId,
    public readonly email: string,
  ) {}
}

export abstract class AccessTokenIssuer {
  public abstract issue(principal: AuthenticatedPrincipal): Promise<string>;
  public abstract verify(token: string): Promise<Result<AuthenticatedPrincipal>>;
  public abstract ttlSeconds(): number;
}

/** Genera tokens opacos aleatorios y su huella (solo se guarda la huella). */
export abstract class OpaqueTokenService {
  public abstract generate(): string;
  public abstract digest(token: string): string;
}
