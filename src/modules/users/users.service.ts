import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role, RoleName, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../../common/constants/auth.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { UserResponseDto } from '../auth/dto/user-response.dto';

type Executor = Prisma.TransactionClient | PrismaService;
type UserWithRole = User & { role: Role };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  }

  create(
    data: {
      email: string;
      passwordHash: string;
      fullName: string;
      emailVerificationToken?: string;
      emailVerificationExpiresAt?: Date;
    },
    tx: Executor = this.prisma,
  ) {
    return tx.user.create({
      data: {
        ...data,
        role: { connect: { name: RoleName.USER } },
      },
      include: { role: true },
    });
  }

  findByValidEmailVerificationToken(token: string) {
    return this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: { gt: new Date() },
      },
    });
  }

  markEmailVerified(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });
  }

  async updateProfile(
    userId: string,
    data: { fullName?: string },
  ): Promise<UserWithRole> {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      include: { role: true },
    });
  }

  /**
   * Verifies the current password, hashes and stores the new one, and
   * revokes every *other* active session (so a compromised password being
   * changed can't keep being used elsewhere) while leaving the session
   * making this request alone — changing your password shouldn't log you
   * yourself out.
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Soft-deletes the account (sets deletedAt, never removes the row — chat
   * history/usage logs still need it for onDelete: SetNull integrity and
   * for the audit trail) and revokes every session, including the current
   * one, since the account is now gone.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toSafeUser(user);
  }

  async findByIdForAdmin(id: string): Promise<UserWithRole> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  toSafeUser(user: UserWithRole): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }
}
