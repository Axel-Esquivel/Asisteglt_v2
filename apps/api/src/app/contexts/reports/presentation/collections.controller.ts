import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { CollectionResponse } from '@asisteglt/shared-contracts';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { CollectionsParsers } from '../application/collections-parsers';
import { CollectionsService } from '../application/collections.service';
import { SupplementaryCollection } from '../domain/supplementary-collection';

/** Colecciones complementarias de un proyecto. */
@Controller('projects/:projectId/collections')
export class CollectionsController {
  public constructor(private readonly collections: CollectionsService) {}

  @Get()
  public async list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<CollectionResponse[]> {
    return (await this.collections.list(projectId, p.userId)).unwrap().map(CollectionsController.present);
  }

  @Post()
  public async create(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<CollectionResponse> {
    const request = CollectionsParsers.request(body).unwrap();
    return CollectionsController.present(
      (await this.collections.save(projectId, p.userId, null, request)).unwrap(),
    );
  }

  @Put(':id')
  public async update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CollectionResponse> {
    const request = CollectionsParsers.request(body).unwrap();
    return CollectionsController.present(
      (await this.collections.save(projectId, p.userId, id, request)).unwrap(),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<void> {
    (await this.collections.delete(projectId, p.userId, id)).unwrap();
  }

  private static present(c: SupplementaryCollection): CollectionResponse {
    return { ...c.getSpec(), id: c.getId().toString(), updatedAt: c.toSnapshot().updatedAt.toISOString() };
  }
}
