import { Nullable } from '@asisteglt/shared-kernel';

export interface ReadMarkerSnapshot {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly readAt: Date;
}

/** Hasta cuándo leyó una persona una conversación (id = conversación:usuario). */
export class ReadMarker {
  private constructor(
    private readonly conversationId: string,
    private readonly userId: string,
    private readAt: Date,
  ) {}

  public static start(conversationId: string, userId: string, at: Date): ReadMarker {
    return new ReadMarker(conversationId, userId, at);
  }

  public static restore(s: ReadMarkerSnapshot): ReadMarker {
    return new ReadMarker(s.conversationId, s.userId, s.readAt);
  }

  public static key(conversationId: string, userId: string): string {
    return `${conversationId}:${userId}`;
  }

  public static readAtOf(marker: Nullable<ReadMarker>): Nullable<Date> {
    return marker === null ? null : marker.readAt;
  }

  public advanceTo(at: Date): void {
    if (at.getTime() > this.readAt.getTime()) {
      this.readAt = at;
    }
  }

  public toSnapshot(): ReadMarkerSnapshot {
    return {
      id: ReadMarker.key(this.conversationId, this.userId),
      conversationId: this.conversationId,
      userId: this.userId,
      readAt: this.readAt,
    };
  }
}
