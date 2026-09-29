import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName, UserStatus } from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminUserDetailResponseDto,
  AdminUserListResponseDto,
  AdminUserResponseDto,
  ListUsersQueryDto,
} from './dto/admin-user.dto';

const USER_WITH_PLAN = {
  role: true,
  subscription: true,
} satisfies Prisma.UserInclude;

type UserWithPlan = Prisma.UserGetPayload<{ include: typeof USER_WITH_PLAN }>;

/**
 * Admin view of accounts. Soft-deleted accounts are invisible here — they
 * can't be listed, fetched, suspended or promoted (404).
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list({
    page,
    limit,
    search,
    role,
    status,
  }: ListUsersQueryDto): Promise<AdminUserListResponseDto> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(role && { role: { name: role } }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: USER_WITH_PLAN,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => this.toResponse(user)),
      meta: PaginationMetaDto.of(page, limit, total),
    };
  }

  async getDetail(userId: string): Promise<AdminUserDetailResponseDto> {
    const user = await this.findActiveOrThrow(userId);
    const [chats, searches, activeSessions, aiRequests] = await Promise.all([
      this.prisma.chat.count({ where: { userId } }),
      this.prisma.webSearch.count({ where: { userId } }),
      this.prisma.session.count({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.apiUsageLog.count({ where: { userId } }),
    ]);

    return {
      ...this.toResponse(user),
      activity: { chats, searches, activeSessions, aiRequests },
    };
  }

  /**
   * Suspending revokes every session, so refresh tokens die immediately
   * too. (Access tokens are already rejected on the next request: the JWT
   * strategy re-checks status every time.) Idempotent — setting the
   * current status again is a no-op.
   */
  async updateStatus(
    userId: string,
    status: UserStatus,
    actorId: string,
  ): Promise<AdminUserResponseDto> {
    this.assertNotSelf(userId, actorId, 'change your own status');
    const user = await this.findActiveOrThrow(userId);
    if (user.status === status) {
      return this.toResponse(user);
    }

    const writes: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.user.update({ where: { id: userId }, data: { status } }),
    ];
    if (status === UserStatus.SUSPENDED) {
      writes.push(
        this.prisma.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      );
    }
    await this.prisma.$transaction(writes);

    this.logger.log(
      `User status changed: user=${userId} ${user.status} -> ${status} by=${actorId}`,
    );
    return this.toResponse(await this.findActiveOrThrow(userId));
  }

  /**
   * Takes effect on the user's next request (roles are re-read per
   * request). Admins can't change their own role, which also means the
   * last admin can never demote themselves out of the panel.
   */
  async updateRole(
    userId: string,
    role: RoleName,
    actorId: string,
  ): Promise<AdminUserResponseDto> {
    this.assertNotSelf(userId, actorId, 'change your own role');
    const user = await this.findActiveOrThrow(userId);
    if (user.role.name === role) {
      return this.toResponse(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: { connect: { name: role } } },
      include: USER_WITH_PLAN,
    });

    this.logger.log(
      `User role changed: user=${userId} ${user.role.name} -> ${role} by=${actorId}`,
    );
    return this.toResponse(updated);
  }

  /** Shared with admin subscription routes: the target must be a live account. */
  async findActiveOrThrow(userId: string): Promise<UserWithPlan> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: USER_WITH_PLAN,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private assertNotSelf(userId: string, actorId: string, action: string): void {
    if (userId === actorId) {
      throw new BadRequestException(`You cannot ${action}`);
    }
  }

  private toResponse(user: UserWithPlan): AdminUserResponseDto {
    const { subscription } = user;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      status: user.status,
      isEmailVerified: user.isEmailVerified,
      subscription: subscription && {
        tier: subscription.tier,
        status: subscription.status,
        requestsUsed: subscription.requestsUsed,
        requestLimit: subscription.requestLimit,
        periodEnd: subscription.periodEnd,
      },
      createdAt: user.createdAt,
    };
  }
}
