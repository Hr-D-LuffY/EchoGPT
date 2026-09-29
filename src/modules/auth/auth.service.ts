import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import ms from 'ms';
import {
  BCRYPT_SALT_ROUNDS,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
} from '../../common/constants/auth.constants';
import { EmailService } from '../../common/services/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { LoginDto } from './dto/login.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RefreshTokenRequestUser } from './strategies/jwt-refresh.strategy';

type UserWithRole = User & { role: Role };

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const verificationToken = randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS,
    );

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await this.usersService.create(
        {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          emailVerificationToken: verificationToken,
          emailVerificationExpiresAt: verificationExpiresAt,
        },
        tx,
      );
      await this.subscriptionsService.createDefaultSubscription(created.id, tx);
      return created;
    });

    // Side effect kept outside the transaction — an email-sending failure
    // shouldn't roll back a successful registration.
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    const tokens = await this.createSessionAndIssueTokens(user, meta);
    return { ...tokens, user: this.usersService.toSafeUser(user) };
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    this.assertAccountActive(user);

    const tokens = await this.createSessionAndIssueTokens(user, meta);
    return { ...tokens, user: this.usersService.toSafeUser(user) };
  }

  async refresh(
    requestUser: RefreshTokenRequestUser,
    meta: RequestMeta,
  ): Promise<AuthTokensResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: requestUser.sessionId },
    });

    const invalid =
      !session ||
      session.revokedAt !== null ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== this.hashToken(requestUser.refreshToken);

    if (invalid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(session!.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    this.assertAccountActive(user);

    // Rotation: revoke the session behind the token just used, issue a
    // fresh session + token pair. If a stolen refresh token is replayed
    // after the legitimate rotation, its hash won't match anymore.
    await this.prisma.session.update({
      where: { id: session!.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.createSessionAndIssueTokens(user, meta);
    return { ...tokens, user: this.usersService.toSafeUser(user) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<MessageResponseDto> {
    const user = await this.usersService.findByValidEmailVerificationToken(
      dto.token,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.usersService.markEmailVerified(user.id);
    return { message: 'Email verified successfully' };
  }

  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Account is no longer active');
    }
    return this.usersService.toSafeUser(user);
  }

  private assertAccountActive(user: User): void {
    if (user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is no longer active');
    }
  }

  private async createSessionAndIssueTokens(
    user: UserWithRole,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const sessionId = randomUUID();
    const accessExpiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
    )! as ms.StringValue;
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    )! as ms.StringValue;

    const accessToken = this.jwtService.sign(
      { sub: user.id, sessionId, role: user.role.name, email: user.email },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: accessExpiresIn,
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: user.id, sessionId },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      },
    );

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ms(refreshExpiresIn)),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
