import { Body, Controller, Get, Param, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ImportUploads } from '../infrastructure/storage/import-uploads';
import { DataRecordPageResponse, ImportBatchResponse, ImportManifest } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { ImportPresenter } from '../application/import.presenter';
import { ImportService, UploadedContent } from '../application/import.service';
import { RecordFilter, RecordsService } from '../application/records.service';
import { ReportsRequestParser } from '../application/request-parsers';
import { ImportBatch } from '../domain/import-batch';
import { RecordPage } from '../domain/ports';
import { ReportsPresenter } from './reports.presenter';

interface MultipartBody {
  readonly manifest: unknown;
}

/** Lo que entrega multer por cada archivo (solo los campos que se usan). */
/** Archivo que multer dejó en el directorio temporal de cargas. */
interface ReceivedFile {
  readonly originalname: string;
  readonly path: string;
  readonly size: number;
}

/** Carga múltiple de archivos y consulta de los datos publicados. */
@Controller('projects/:projectId')
export class ImportsController {
  public constructor(
    private readonly imports: ImportService,
    private readonly records: RecordsService,
  ) {}

  @Post('imports')
  @UseInterceptors(
    FilesInterceptor('files', ImportService.MAX_FILES, {
      limits: { fileSize: ImportService.MAX_FILE_BYTES },
    }),
  )
  public async submit(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @UploadedFiles() files: ReceivedFile[],
    @Body() body: MultipartBody,
  ): Promise<ImportBatchResponse> {
    const received: ReceivedFile[] = Array.isArray(files) ? files : [];
    try {
      const manifest: ImportManifest = ReportsRequestParser.manifest(body.manifest).unwrap();
      const contents: UploadedContent[] = received.map((file: ReceivedFile): UploadedContent =>
        UploadedContent.fromFile(
          Buffer.from(file.originalname, 'latin1').toString('utf8'),
          file.path,
          file.size,
        ),
      );
      return ImportPresenter.batch(
        (await this.imports.submit(projectId, p.userId, manifest, contents)).unwrap(),
      );
    } finally {
      await ImportUploads.discard(received.map((file: ReceivedFile): string => file.path));
    }
  }

  @Get('imports')
  public async list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<ImportBatchResponse[]> {
    return (await this.imports.list(projectId, p.userId))
      .unwrap()
      .map((b: ImportBatch): ImportBatchResponse => ImportPresenter.batch(b));
  }

  @Get('imports/:batchId')
  public async get(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
  ): Promise<ImportBatchResponse> {
    return ImportPresenter.batch((await this.imports.get(projectId, p.userId, batchId)).unwrap());
  }

  @Get('records')
  public async page(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Query('period') period: string,
    @Query('profileId') profileId: string,
    @Query('companyId') companyId: string,
    @Query('loadId') loadId: string,
    @Query('page') page: string,
    @Query('size') size: string,
  ): Promise<DataRecordPageResponse> {
    const filter: RecordFilter = new RecordFilter(
      ImportsController.text(period),
      ImportsController.text(profileId),
      ImportsController.text(companyId),
      ImportsController.text(loadId),
    );
    const pageNumber: number = ImportsController.integer(page, 0);
    const pageSize: number = ImportsController.integer(size, 50);
    const result: RecordPage = (
      await this.records.page(projectId, p.userId, filter, pageNumber, pageSize)
    ).unwrap();
    return {
      total: result.total,
      page: pageNumber,
      size: pageSize,
      rows: result.rows.map(ReportsPresenter.record),
    };
  }

  private static text(raw: unknown): Nullable<string> {
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
  }

  private static integer(raw: unknown, fallback: number): number {
    const value: number = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(value) ? value : fallback;
  }
}
