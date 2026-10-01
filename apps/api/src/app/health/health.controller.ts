import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@asisteglt/shared-contracts';
import { Public } from '../common/auth/auth.decorators';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  public constructor(private readonly health: HealthService) {}

  @Get()
  public check(): HealthResponse {
    return this.health.check();
  }
}
