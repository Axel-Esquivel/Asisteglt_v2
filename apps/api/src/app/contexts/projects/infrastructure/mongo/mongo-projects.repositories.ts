import { Injectable } from '@nestjs/common';
import { EntityId, Nullable, Optional } from '@asisteglt/shared-kernel';
import { Model } from 'mongoose';
import { MongoDatabase } from '../../../../common/persistence/mongo-database';
import { ProjectRepository, ShareLinkRepository } from '../../domain/ports';
import { Project } from '../../domain/project';
import { ShareLink } from '../../domain/share-link';
import { PROJECT_SCHEMA, ProjectRecord, SHARE_LINK_SCHEMA, ShareLinkRecord } from './projects.schemas';

const toProject = (record: ProjectRecord): Project => {
  const { _id, ...rest } = record;
  return Project.restore({ ...rest, id: _id });
};

const toShareLink = (record: ShareLinkRecord): ShareLink => {
  const { _id, ...rest } = record;
  return ShareLink.restore({ ...rest, id: _id });
};

@Injectable()
export class MongoProjectRepository extends ProjectRepository {
  private readonly model: Model<ProjectRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ProjectRecord>('Project', PROJECT_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<Project>> {
    const record: Nullable<ProjectRecord> = await this.model
      .findById(id.toString())
      .lean<ProjectRecord>()
      .exec();
    return Optional.fromNullable(record).map(toProject);
  }

  public override async findByMember(userId: EntityId): Promise<Project[]> {
    const records: ProjectRecord[] = await this.model
      .find({ 'members.userId': userId.toString() })
      .sort({ createdAt: -1 })
      .lean<ProjectRecord[]>()
      .exec();
    return records.map(toProject);
  }

  public override async save(project: Project): Promise<void> {
    const { id, ...rest } = project.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}

@Injectable()
export class MongoShareLinkRepository extends ShareLinkRepository {
  private readonly model: Model<ShareLinkRecord>;

  public constructor(database: MongoDatabase) {
    super();
    this.model = database.connection.model<ShareLinkRecord>('ShareLink', SHARE_LINK_SCHEMA);
  }

  public override async findById(id: EntityId): Promise<Optional<ShareLink>> {
    const record: Nullable<ShareLinkRecord> = await this.model
      .findById(id.toString())
      .lean<ShareLinkRecord>()
      .exec();
    return Optional.fromNullable(record).map(toShareLink);
  }

  public override async findByTokenHash(hash: string): Promise<Optional<ShareLink>> {
    const record: Nullable<ShareLinkRecord> = await this.model
      .findOne({ tokenHash: hash })
      .lean<ShareLinkRecord>()
      .exec();
    return Optional.fromNullable(record).map(toShareLink);
  }

  public override async findByProject(projectId: EntityId): Promise<ShareLink[]> {
    const records: ShareLinkRecord[] = await this.model
      .find({ projectId: projectId.toString() })
      .sort({ createdAt: -1 })
      .lean<ShareLinkRecord[]>()
      .exec();
    return records.map(toShareLink);
  }

  public override async save(link: ShareLink): Promise<void> {
    const { id, ...rest } = link.toSnapshot();
    await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true }).exec();
  }
}
