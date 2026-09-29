import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminOnly } from './decorators/admin-only.decorator';
import {
  SystemHealthQueryDto,
  SystemHealthResponseDto,
} from './dto/system-health.dto';
import { SystemHealthService } from './system-health.service';

@AdminOnly()
@Controller('admin/health')
export class AdminHealthController {
  constructor(private readonly systemHealthService: SystemHealthService) {}

  @Get()
  @ApiOperation({
    summary: 'System health: database, providers, uptime (admin)',
    description:
      'Always 200 — the verdict is in `status` (ok / degraded / down). `check=true` pings every enabled provider live.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SystemHealthResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Unknown query parameter',
  })
  getHealth(
    @Query() query: SystemHealthQueryDto,
  ): Promise<SystemHealthResponseDto> {
    return this.systemHealthService.getSystemHealth(query.check);
  }
}
