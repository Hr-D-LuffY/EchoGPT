import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminOnly } from './decorators/admin-only.decorator';
import {
  DateRangeQueryDto,
  ListLogsQueryDto,
  UsageAnalyticsResponseDto,
  UsageLogListResponseDto,
} from './dto/analytics.dto';
import { DashboardResponseDto } from './dto/dashboard.dto';

@AdminOnly()
@Controller('admin')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard statistics (admin)',
    description:
      'Users, plan mix and estimated revenue, AI usage (30d / 24h), content totals, provider status.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: DashboardResponseDto })
  getDashboard(): Promise<DashboardResponseDto> {
    return this.analyticsService.getDashboard();
  }

  @Get('analytics/usage')
  @ApiOperation({
    summary: 'AI usage analytics over a date range (admin)',
    description:
      'Totals, breakdowns by category and provider, a zero-filled daily series (UTC), and top users. Defaults to the last 30 days; max 366.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UsageAnalyticsResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid date, from >= to, or range over 366 days',
  })
  getUsageAnalytics(
    @Query() query: DateRangeQueryDto,
  ): Promise<UsageAnalyticsResponseDto> {
    return this.analyticsService.getUsageAnalytics(query);
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Request logs: every AI provider call (admin)',
    description:
      'Newest first. Filter by user, provider, category, outcome, status code and date range (defaults to the last 30 days).',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UsageLogListResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid filter, pagination or date range',
  })
  listLogs(@Query() query: ListLogsQueryDto): Promise<UsageLogListResponseDto> {
    return this.analyticsService.listLogs(query);
  }
}
