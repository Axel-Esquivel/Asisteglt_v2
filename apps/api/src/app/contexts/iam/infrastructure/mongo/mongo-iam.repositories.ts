import { Injectable } from '@nestjs/common';
import { Email, EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { SessionRepository, UserRepository } from '../../domain/ports';
import { Session } from '../../domain/session';
import { User } from '../../domain/user';
import { SESSION_SCHEMA, SessionRecord, USER_SCHEMA, UserRecord } from './iam.schemas';

const toUser = (record: UserRecord): User => {
  const { _id, ...rest } = record;
  return User.restore({ ...rest, id: _id });
};

const toSession = (record: SessionRecord): Session => {
  const { _id, ...rest } = record;
  return Session.restore({ ...rest, id: _id });
};

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class MongoUserRepository extends UserRepository {
  private readonly model: Model<UserRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<UserRecord>('User', USER_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<User>> {
    const record: Nullable<UserRecord> = await this.model.findById(id.toString()).lean<UserRecord>().exec();
    return Optional.fromNullable(record).map(toUser);
  }

  public override async findByEmail(email: Email): Promise<Optional<User>> {
    const record: Nullable<UserRecord> = await this.model.findOne({ email: email.toString() }).lean<UserRecord>().exec();
    return Optional.fromNullable(record).map(toUser);
  }

  public override async findManyByIds(ids: ReadonlyArray<EntityId>): Promise<User[]> {
    const records: UserRecord[] = await this.model
      .find({ _id: { $in: ids.map((id: EntityId): string => id.toString()) } })
      .lean<UserRecord[]>()
      .exec();
    return records.map(toUser);
  }

  public override async search(text: string, limit: number): Promise<User[]> {
    const pattern: RegExp = new RegExp(escapeRegex(text.trim()), 'i');
    const records: UserRecord[] = await this.model
      .find({ $or: [{ email: pattern }, { displayName: pattern }] })
      .limit(limit)
      .lean<UserRecord[]>()
      .exec();
    return records.map(toUser);
  }

  public override async save(user: User): Promise<void> {
    const { id, ...rest } = user.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}

@Injectable()
export class MongoSessionRepository extends SessionRepository {
  private readonly model: Model<SessionRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<SessionRecord>('Session', SESSION_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<Session>> {
    const record: Nullable<SessionRecord> = await this.model.findById(id.toString()).lean<SessionRecord>().exec();
    return Optional.fromNullable(record).map(toSession);
  }

  public override async findByAnyTokenHash(hash: string): Promise<Optional<Session>> {
    const record: Nullable<SessionRecord> = await this.model
      .findOne({ $or: [{ refreshTokenHash: hash }, { previousTokenHashes: hash }] })
      .lean<SessionRecord>()
      .exec();
    return Optional.fromNullable(record).map(toSession);
  }

  public override async findByUser(userId: EntityId): Promise<Session[]> {
    const records: SessionRecord[] = await this.model.find({ userId: userId.toString() }).lean<SessionRecord[]>().exec();
    return records.map(toSession);
  }

  public override async save(session: Session): Promise<void> {
    const { id, ...rest } = session.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}
