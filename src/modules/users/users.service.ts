import { Injectable } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Executor = Prisma.TransactionClient | PrismaService;

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
}