import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { AuthService, RequestMeta } from './auth.service';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestUser } from './interfaces/jwt-payload.interface';
import { RefreshTokenRequestUser } from './strategies/jwt-refresh.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private meta(req: Request): RequestMeta {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create a new account' })
  @ApiResponse({ status: 201, type: AuthTokensResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.register(dto, this.meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.login(dto, this.meta(req));
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({
    summary:
      'Exchange a refresh token for a new token pair (rotates the session)',
  })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or already-rotated refresh token',
  })
  refresh(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() user: unknown,
    @Req() req: Request,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(
      user as RefreshTokenRequestUser,
      this.meta(req),
    );
  }

  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session (refresh token)' })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async logout(@CurrentUser() user: RequestUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify an email address using the token issued at registration',
  })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @ApiBearerAuth('access-token')
  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  me(@CurrentUser() user: RequestUser): Promise<UserResponseDto> {
    return this.authService.me(user.sub);
  }
}
