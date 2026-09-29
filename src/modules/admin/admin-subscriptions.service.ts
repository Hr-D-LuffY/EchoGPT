import { Injectable } from '@nestjs/common';
import { Prisma, Subscription } from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminSubscriptionListResponseDto,
  AdminSubscriptionResponseDto,
  ListSubscriptionsQueryDto,
  UpdateSubscriptionDto,
} from './dto/admin-subscription.dto';

/**
 * Listing lives here; every write goes through SubscriptionsService so plan
 * limits and usage rules stay defined in exactly one place.
 */
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly adminUsersService: AdminUsersService,
  ) {}

  async list({
    page,
    limit,
    tier,
    status,
  }: ListSubscriptionsQueryDto): Promise<AdminSubscriptionListResponseDto> {
    const where: Prisma.SubscriptionWhereInput = {
      user: { deletedAt: null },
      ...(tier && { tier }),
      ...(status && { status }),
    };

    const [subscriptions, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      items: subscriptions.map((s) => this.toResponse(s, s.user.email)),
      meta: PaginationMetaDto.of(page, limit, total),
    };
  }

  async update(
    userId: string,
    dto: UpdateSubscriptionDto,
    actorId: string,
  ): Promise<AdminSubscriptionResponseDto> {
    const user = await this.adminUsersService.findActiveOrThrow(userId);
    const updated = await this.subscriptionsService.applyAdminOverride(
      userId,
      dto,
      actorId,
    );
    return this.toResponse(updated, user.email);
  }

  private toResponse(
    subscription: Subscription,
    userEmail: string,
  ): AdminSubscriptionResponseDto {
    return {
      ...this.subscriptionsService.toResponse(subscription),
      userId: subscription.userId,
      userEmail,
    };
  }
}
