import { Injectable } from '@nestjs/common';
import {
  BalanceChecksRequest,
  IngestionErrorCode,
  ProfileRequest,
  ProfileStatus,
} from '@asisteglt/shared-contracts';
import { Clock, ConflictError, EntityId, NotFoundError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import { DataSourceProfile, ProfileDraft } from '../domain/data-source-profile';
import { FieldCatalog } from '../domain/field-catalog';
import { ProfileRepository } from '../domain/ports';
import { CatalogService } from './catalog.service';
import { ReportsAccess } from './reports-access';

/** Preconfiguraciones con nombre: crear, editar (nueva versión), activar, archivar y duplicar. */
@Injectable()
export class ProfileService {
  public constructor(
    private readonly profiles: ProfileRepository,
    private readonly catalogs: CatalogService,
    private readonly access: ReportsAccess,
    private readonly clock: Clock,
  ) {}

  public async list(projectId: string, userId: EntityId): Promise<Result<DataSourceProfile[]>> {
    return (await this.access.read(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<DataSourceProfile[]>> =>
        Result.ok(await this.profiles.findByProject(project.getId())),
    );
  }

  public async get(
    projectId: string,
    userId: EntityId,
    profileId: string,
  ): Promise<Result<DataSourceProfile>> {
    return (await this.access.read(projectId, userId)).flatMapAsync(
      (project: Project): Promise<Result<DataSourceProfile>> => this.find(project, profileId),
    );
  }

  public async create(
    projectId: string,
    userId: EntityId,
    request: ProfileRequest,
  ): Promise<Result<DataSourceProfile>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<DataSourceProfile>> => {
        const catalog: FieldCatalog = await this.catalogs.of(project.getId());
        const unique: Result<true> = await this.uniqueName(project.getId(), request.name, null);
        return unique
          .flatMap((): Result<DataSourceProfile> =>
            DataSourceProfile.create(project.getId(), ProfileService.draft(request), catalog, this.clock),
          )
          .flatMapAsync((profile: DataSourceProfile): Promise<Result<DataSourceProfile>> =>
            this.persist(profile),
          );
      },
    );
  }

  public async update(
    projectId: string,
    userId: EntityId,
    profileId: string,
    request: ProfileRequest,
  ): Promise<Result<DataSourceProfile>> {
    return this.mutate(
      projectId,
      userId,
      profileId,
      async (profile: DataSourceProfile, project: Project): Promise<Result<DataSourceProfile>> => {
        const unique: Result<true> = await this.uniqueName(project.getId(), request.name, profileId);
        const catalog: FieldCatalog = await this.catalogs.of(project.getId());
        return unique.flatMap((): Result<DataSourceProfile> =>
          profile.update(ProfileService.draft(request), catalog, this.clock),
        );
      },
    );
  }

  public setChecks(
    projectId: string,
    userId: EntityId,
    profileId: string,
    request: BalanceChecksRequest,
  ): Promise<Result<DataSourceProfile>> {
    return this.mutate(
      projectId,
      userId,
      profileId,
      async (profile: DataSourceProfile, project: Project): Promise<Result<DataSourceProfile>> =>
        profile.setChecks(request.checks, await this.catalogs.of(project.getId()), this.clock),
    );
  }

  public activate(
    projectId: string,
    userId: EntityId,
    profileId: string,
  ): Promise<Result<DataSourceProfile>> {
    return this.mutate(
      projectId,
      userId,
      profileId,
      async (profile: DataSourceProfile, project: Project): Promise<Result<DataSourceProfile>> =>
        profile.activate(await this.catalogs.of(project.getId()), this.clock),
    );
  }

  public archive(projectId: string, userId: EntityId, profileId: string): Promise<Result<DataSourceProfile>> {
    return this.mutate(
      projectId,
      userId,
      profileId,
      (profile: DataSourceProfile): Promise<Result<DataSourceProfile>> => {
        profile.archive(this.clock);
        return Promise.resolve(Result.ok(profile));
      },
    );
  }

  public async duplicate(
    projectId: string,
    userId: EntityId,
    profileId: string,
    name: string,
  ): Promise<Result<DataSourceProfile>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<DataSourceProfile>> =>
        (await this.find(project, profileId)).flatMapAsync(
          (source: DataSourceProfile): Promise<Result<DataSourceProfile>> => {
            const s = source.toSnapshot();
            return this.create(projectId, userId, {
              name,
              description: s.description,
              extensions: s.extensions,
              fileNamePattern: s.fileNamePattern,
              spec: s.spec,
            });
          },
        ),
    );
  }

  public async find(project: Project, profileId: string): Promise<Result<DataSourceProfile>> {
    const id: Result<EntityId> = EntityId.fromString(profileId);
    const profile: Nullable<DataSourceProfile> = id.isOk()
      ? (await this.profiles.findById(id.unwrap()))
          .filter((p: DataSourceProfile): boolean => p.toSnapshot().projectId === project.getId().toString())
          .toNullable()
      : null;
    return profile === null
      ? Result.fail(new NotFoundError(IngestionErrorCode.PROFILE_NOT_FOUND, 'La preconfiguración no existe'))
      : Result.ok(profile);
  }

  private async mutate(
    projectId: string,
    userId: EntityId,
    profileId: string,
    change: (profile: DataSourceProfile, project: Project) => Promise<Result<DataSourceProfile>>,
  ): Promise<Result<DataSourceProfile>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<DataSourceProfile>> =>
        (await this.find(project, profileId)).flatMapAsync(
          async (profile: DataSourceProfile): Promise<Result<DataSourceProfile>> =>
            (await change(profile, project)).flatMapAsync(
              (changed: DataSourceProfile): Promise<Result<DataSourceProfile>> => this.persist(changed),
            ),
        ),
    );
  }

  private async uniqueName(
    projectId: EntityId,
    name: string,
    selfId: Nullable<string>,
  ): Promise<Result<true>> {
    const wanted: string = DataSourceProfile.normalizeName(name);
    const clash: boolean = (await this.profiles.findByProject(projectId)).some(
      (p: DataSourceProfile): boolean => {
        const s = p.toSnapshot();
        return (
          s.id !== selfId &&
          s.status !== ProfileStatus.ARCHIVED &&
          DataSourceProfile.normalizeName(s.name) === wanted
        );
      },
    );
    return clash
      ? Result.fail(
          new ConflictError(
            IngestionErrorCode.DUPLICATE_PROFILE_NAME,
            `Ya existe una preconfiguración llamada «${name.trim()}»`,
          ),
        )
      : Result.ok(true);
  }

  private async persist(profile: DataSourceProfile): Promise<Result<DataSourceProfile>> {
    await this.profiles.save(profile);
    return Result.ok(profile);
  }

  private static draft(request: ProfileRequest): ProfileDraft {
    return {
      name: request.name,
      description: request.description,
      extensions: request.extensions,
      fileNamePattern: request.fileNamePattern,
      spec: request.spec,
    };
  }
}
