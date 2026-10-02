import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CountResponse,
  EvidenceResponse,
  MyWorkResponse,
  SupervisionResponse,
} from '@asisteglt/shared-contracts';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { EvidenceFile, EvidenceService } from '../application/evidence.service';
import { InventoryService } from '../application/inventory.service';

interface ReceivedPhoto {
  readonly buffer: Buffer;
}
import { InventoryParsers } from './inventory.parsers';

/** Tomas físicas de inventario de un proyecto. */
@Controller('projects/:projectId/inventory/counts')
export class InventoryController {
  public constructor(
    private readonly inventory: InventoryService,
    private readonly evidence: EvidenceService,
  ) {}

  @Get()
  public async list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<CountResponse[]> {
    return (await this.inventory.list(projectId, p.userId)).unwrap();
  }

  @Post()
  public async create(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<CountResponse> {
    return (await this.inventory.create(projectId, p.userId, InventoryParsers.count(body).unwrap())).unwrap();
  }

  @Get(':countId')
  public async get(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
  ): Promise<CountResponse> {
    return (await this.inventory.get(projectId, p.userId, countId)).unwrap();
  }

  @Put(':countId/items')
  public async items(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
    @Body() body: unknown,
  ): Promise<CountResponse> {
    return (
      await this.inventory.replaceItems(projectId, p.userId, countId, InventoryParsers.items(body).unwrap())
    ).unwrap();
  }

  @Put(':countId/participants')
  public async participants(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
    @Body() body: unknown,
  ): Promise<CountResponse> {
    return (
      await this.inventory.setParticipants(
        projectId,
        p.userId,
        countId,
        InventoryParsers.participants(body).unwrap(),
      )
    ).unwrap();
  }

  @Post(':countId/start')
  public async start(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
  ): Promise<CountResponse> {
    return (await this.inventory.start(projectId, p.userId, countId)).unwrap();
  }

  @Get(':countId/my-work')
  public async myWork(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
  ): Promise<MyWorkResponse> {
    return (await this.inventory.myWork(projectId, p.userId, countId)).unwrap();
  }

  @Post(':countId/entries')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async record(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
    @Body() body: unknown,
  ): Promise<void> {
    (
      await this.inventory.record(projectId, p.userId, countId, InventoryParsers.entry(body).unwrap())
    ).unwrap();
  }

  @Get(':countId/supervision')
  public async supervision(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
  ): Promise<SupervisionResponse> {
    return (await this.inventory.supervision(projectId, p.userId, countId)).unwrap();
  }

  @Post(':countId/rounds/close')
  public async closeRound(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
  ): Promise<CountResponse> {
    return (await this.inventory.closeRound(projectId, p.userId, countId)).unwrap();
  }

  @Post(':countId/recount')
  public async recount(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
  ): Promise<CountResponse> {
    return (await this.inventory.recount(projectId, p.userId, countId)).unwrap();
  }

  @Post(':countId/reassign')
  public async reassign(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
    @Body() body: unknown,
  ): Promise<CountResponse> {
    const request = InventoryParsers.reassign(body).unwrap();
    return (await this.inventory.reassign(projectId, p.userId, countId, request)).unwrap();
  }

  @Post(':countId/close')
  public async close(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
  ): Promise<CountResponse> {
    return (await this.inventory.close(projectId, p.userId, countId)).unwrap();
  }

  @Post(':countId/items/:itemId/photos')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: EvidenceService.MAX_BYTES } }))
  public async addPhoto(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: ReceivedPhoto,
  ): Promise<EvidenceResponse> {
    return (
      await this.evidence.add(projectId, p.userId, countId, itemId, new Uint8Array(file.buffer))
    ).unwrap();
  }

  @Get(':countId/items/:itemId/photos')
  public async photos(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
    @Param('itemId') itemId: string,
  ): Promise<EvidenceResponse[]> {
    return (await this.evidence.list(projectId, p.userId, countId, itemId)).unwrap();
  }

  @Get(':countId/photos/:photoId')
  @Header('Cache-Control', 'private, max-age=300')
  public async photo(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('countId') countId: string,
    @Param('photoId') photoId: string,
  ): Promise<StreamableFile> {
    const file: EvidenceFile = (await this.evidence.file(projectId, p.userId, countId, photoId)).unwrap();
    return new StreamableFile(file.bytes, { type: file.contentType });
  }
}
