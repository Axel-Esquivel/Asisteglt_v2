import { AuthSessionResponse, SessionResponse, UserResponse } from '@asisteglt/shared-contracts';
import { EntityId } from '@asisteglt/shared-kernel';
import { IssuedSession } from '../application/session-issuer';
import { Session } from '../domain/session';
import { User } from '../domain/user';

export class IamPresenter {
  public static user(user: User): UserResponse {
    return {
      id: user.getId().toString(),
      email: user.getEmail().toString(),
      displayName: user.getDisplayName(),
      createdAt: user.getCreatedAt().toISOString(),
    };
  }

  public static session(issued: IssuedSession): AuthSessionResponse {
    return {
      accessToken: issued.accessToken,
      expiresInSeconds: issued.accessTokenTtlSeconds,
      user: IamPresenter.user(issued.user),
    };
  }

  public static activeSession(session: Session, currentId: EntityId): SessionResponse {
    const s = session.toSnapshot();
    return {
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: session.getId().equals(currentId),
    };
  }
}
