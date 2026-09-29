import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import {
  LivenessResponseDto,
  SystemStatus,
} from './modules/admin/dto/system-health.dto';
import { SystemHealthService } from './modules/admin/system-health.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly systemHealthService: SystemHealthService) {}

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Liveness probe (public)',
    description:
      'For load balancers / uptime monitors: 200 when the API and database are up, 503 otherwise. Details live at GET /admin/health.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: LivenessResponseDto })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Database unreachable',
  })
  async getHealth(): Promise<LivenessResponseDto> {
    const liveness = await this.systemHealthService.getLiveness();
    if (liveness.status === SystemStatus.DOWN) {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return liveness;
  }
}
