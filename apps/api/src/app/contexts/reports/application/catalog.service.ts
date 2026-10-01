import { Injectable } from '@nestjs/common';
import { CatalogErrorCode, CatalogTemplate } from '@asisteglt/shared-contracts';
import { ConflictError, EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import { DataSourceProfile } from '../domain/data-source-profile';
import { CatalogField, FieldCatalog, FieldDefinition, FieldLabel } from '../domain/field-catalog';
import { OperationPipeline } from '../domain/operation-pipeline';
import { FieldCatalogRepository, OperationPipelineRepository, ProfileRepository } from '../domain/ports';
import { CatalogTemplates } from './catalog-templates';
import { ReportsAccess } from './reports-access';

/** Resultado de aplicar una plantilla: los nombres repetidos se omiten y se informan. */
export class TemplateOutcome {
  public constructor(
    public readonly catalog: FieldCatalog,
    public readonly skipped: ReadonlyArray<string>,
  ) {}
}

@Injectable()
export class CatalogService {
  public constructor(
    private readonly catalogs: FieldCatalogRepository,
    private readonly profiles: ProfileRepository,
    private readonly pipelines: OperationPipelineRepository,
    private readonly access: ReportsAccess,
  ) {}

  public async get(projectId: string, userId: EntityId): Promise<Result<FieldCatalog>> {
    return (await this.access.read(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<FieldCatalog>> => Result.ok(await this.of(project.getId())),
    );
  }

  public async of(projectId: EntityId): Promise<FieldCatalog> {
    return (await this.catalogs.findByProject(projectId)).orElseGet((): FieldCatalog =>
      FieldCatalog.empty(projectId),
    );
  }

  public add(
    projectId: string,
    userId: EntityId,
    definition: FieldDefinition,
  ): Promise<Result<CatalogField>> {
    return this.mutate(projectId, userId, (c: FieldCatalog): Result<CatalogField> => c.add(definition));
  }

  public async redefine(
    projectId: string,
    userId: EntityId,
    key: string,
    definition: FieldDefinition,
  ): Promise<Result<CatalogField>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<CatalogField>> => {
        const inUse: boolean = (await this.usages(project.getId(), key)).length > 0;
        return this.mutate(projectId, userId, (c: FieldCatalog): Result<CatalogField> =>
          c.redefine(key, definition, inUse),
        );
      },
    );
  }

  public rename(
    projectId: string,
    userId: EntityId,
    key: string,
    label: string,
  ): Promise<Result<CatalogField>> {
    return this.mutate(projectId, userId, (c: FieldCatalog): Result<CatalogField> => c.rename(key, label));
  }

  public async deactivate(
    projectId: string,
    userId: EntityId,
    key: string,
    force: boolean,
  ): Promise<Result<CatalogField>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<CatalogField>> => {
        const usages: string[] = await this.usages(project.getId(), key);
        return this.mutate(projectId, userId, (c: FieldCatalog): Result<CatalogField> =>
          c.deactivate(key, usages, force),
        );
      },
    );
  }

  public applyTemplate(
    projectId: string,
    userId: EntityId,
    template: CatalogTemplate,
  ): Promise<Result<TemplateOutcome>> {
    return this.mutate(projectId, userId, (catalog: FieldCatalog): Result<TemplateOutcome> => {
      const skipped: string[] = [];
      const keyOf = (label: string): Nullable<string> => {
        const wanted: string = FieldLabel.normalize(label);
        const match: Nullable<CatalogField> =
          catalog
            .all()
            .find((f: CatalogField): boolean => f.isActive() && FieldLabel.normalize(f.label) === wanted) ??
          null;
        return match === null ? null : match.key;
      };
      for (const field of CatalogTemplates.fields(template)) {
        const added: Result<CatalogField> = catalog.add(CatalogTemplates.definition(field, keyOf));
        if (!added.isOk()) {
          skipped.push(field.label);
        }
      }
      return Result.ok(new TemplateOutcome(catalog, skipped));
    });
  }

  /** Dónde se usa un encabezado (por ahora: preconfiguraciones), mostrado por nombre. */
  public async usages(projectId: EntityId, key: string): Promise<string[]> {
    const profiles: DataSourceProfile[] = await this.profiles.findByProject(projectId);
    const operations: string[] = (await this.pipelines.findByProject(projectId))
      .map((pipeline: OperationPipeline): string[] => pipeline.usages(key))
      .orElseGet((): string[] => []);
    return [
      ...profiles
        .filter((p: DataSourceProfile): boolean => p.fieldKeys().includes(key))
        .map((p: DataSourceProfile): string => `Preconfiguración ${p.getName()}`),
      ...operations,
    ];
  }

  private async mutate<T>(
    projectId: string,
    userId: EntityId,
    change: (c: FieldCatalog) => Result<T>,
  ): Promise<Result<T>> {
    return (await this.access.configure(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<T>> => {
        const catalog: FieldCatalog = await this.of(project.getId());
        const expected: number = catalog.getVersion();
        const result: Result<T> = change(catalog);
        if (
          result.isOk() &&
          catalog.getVersion() !== expected &&
          !(await this.catalogs.save(catalog, expected))
        ) {
          return Result.fail(
            new ConflictError(
              CatalogErrorCode.CATALOG_VERSION_CONFLICT,
              'El catálogo cambió mientras lo editabas; vuelve a intentarlo',
            ),
          );
        }
        return result;
      },
    );
  }
}
