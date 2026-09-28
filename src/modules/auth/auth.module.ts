import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailService } from '../../common/services/email.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [
    PassportModule,
    // Secrets/expiry are passed explicitly on every sign()/verify() call
    // (see AuthService and the strategies) since access and refresh tokens
    // use different secrets — no default is configured here.
    JwtModule.register({}),
    UsersModule,
    SubscriptionsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy, EmailService],
})
export class AuthModule {}
