import { Injectable } from '@nestjs/common';
import { EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { Project } from '../../projects/domain/project';
import { DataRecordRepository, RecordPage, RecordQuery } from '../domain/ports';
import { ReportsAccess } from './reports-access';

export class RecordFilter {
  public constructor(
    public readonly period: Nullable<string>,
    public readonly profileId: Nullable<string>,
    public readonly companyId: Nullable<string>,
    public readonly loadId: Nullable<string>,
  ) {}
}

/** Consulta de los datos publicados (solo la versión vigente de cada carga). */
@Injectable()
export class RecordsService {
  public static readonly MAX_PAGE_SIZE: number = 200;

  public constructor(
    private readonly records: DataRecordRepository,
    private readonly access: ReportsAccess,
  ) {}

  public async page(
    projectId: string,
    userId: EntityId,
    filter: RecordFilter,
    page: number,
    size: number,
  ): Promise<Result<RecordPage>> {
    return (await this.access.view(projectId, userId)).flatMapAsync(
      async (project: Project): Promise<Result<RecordPage>> => {
        const query: RecordQuery = new RecordQuery(
          project.getId().toString(),
          filter.period,
          filter.profileId,
          filter.companyId,
          filter.loadId === null ? [] : [filter.loadId],
        );
        const safeSize: number = Math.min(Math.max(1, size), RecordsService.MAX_PAGE_SIZE);
        return Result.ok(await this.records.page(query, Math.max(0, page), safeSize));
      },
    );
  }
}
