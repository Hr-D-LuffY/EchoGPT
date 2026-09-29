import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AdminOnly } from './decorators/admin-only.decorator';
import {
  AdminSubscriptionListResponseDto,
  AdminSubscriptionResponseDto,
  ListSubscriptionsQueryDto,
  UpdateSubscriptionDto,
} from './dto/admin-subscription.dto';

@AdminOnly()
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(
    private readonly adminSubscriptionsService: AdminSubscriptionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List subscriptions, filterable by tier and status (admin)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: AdminSubscriptionListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid filter or pagination value',
  })
  list(
    @Query() query: ListSubscriptionsQueryDto,
  ): Promise<AdminSubscriptionListResponseDto> {
    return this.adminSubscriptionsService.list(query);
  }

  @Patch(':userId')
  @ApiParam({ name: 'userId', description: 'Owner of the subscription' })
  @ApiOperation({
    summary: "Override a user's subscription (admin)",
    description:
      'Set tier (limit follows the plan), status, and/or reset the current period usage.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AdminSubscriptionResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Empty body or invalid value',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User or subscription not found',
  })
  update(
    @CurrentUser() admin: RequestUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateSubscriptionDto,
  ): Promise<AdminSubscriptionResponseDto> {
    return this.adminSubscriptionsService.update(userId, dto, admin.sub);
  }
}
