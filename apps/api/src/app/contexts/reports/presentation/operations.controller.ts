import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { OperationsResponse } from '@asisteglt/shared-contracts';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { OperationsParsers } from '../application/operations-parsers';
import { OperationsService } from '../application/operations.service';

/** Operaciones sobre los datos cargados (campos calculados, acumulados y conversión). */
@Controller('projects/:projectId/operations')
export class OperationsController {
  public constructor(private readonly operations: OperationsService) {}

  @Get()
  public async get(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<OperationsResponse> {
    return (await this.operations.get(projectId, p.userId)).unwrap();
  }

  @Put()
  public async save(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<OperationsResponse> {
    const request = OperationsParsers.request(body).unwrap();
    return (await this.operations.save(projectId, p.userId, request)).unwrap();
  }
}
