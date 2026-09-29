import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { PlanResponseDto } from './dto/plan-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { UsageResponseDto } from './dto/usage-response.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'List available subscription plans' })
  @ApiResponse({ status: HttpStatus.OK, type: [PlanResponseDto] })
  listPlans(): PlanResponseDto[] {
    return this.subscriptionsService.listPlans();
  }

  @Get('me')
  @ApiOperation({ summary: "Get the current user's subscription status" })
  @ApiResponse({ status: HttpStatus.OK, type: SubscriptionResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subscription not found',
  })
  async getMine(
    @CurrentUser() user: RequestUser,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionsService.getCurrent(user.sub);
    return this.subscriptionsService.toResponse(subscription);
  }

  @Get('usage')
  @ApiOperation({
    summary: 'Get remaining requests for the current billing period',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UsageResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subscription not found',
  })
  async getUsage(@CurrentUser() user: RequestUser): Promise<UsageResponseDto> {
    const subscription = await this.subscriptionsService.getCurrent(user.sub);
    return this.subscriptionsService.toUsage(subscription);
  }

  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upgrade to Premium (billing simulated, takes effect immediately)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SubscriptionResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Already on the PREMIUM plan',
  })
  async upgrade(
    @CurrentUser() user: RequestUser,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionsService.upgrade(user.sub);
    return this.subscriptionsService.toResponse(subscription);
  }

  @Post('downgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Downgrade to Free (current period and usage are kept)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SubscriptionResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Already on the FREE plan',
  })
  async downgrade(
    @CurrentUser() user: RequestUser,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionsService.downgrade(user.sub);
    return this.subscriptionsService.toResponse(subscription);
  }
}
