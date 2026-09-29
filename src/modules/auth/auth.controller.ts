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
import { THROTTLE_AUTH } from '../../common/constants/throttle.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { AuthService, RequestMeta } from './auth.service';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { LoginDto } from './dto/login.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestUser } from './interfaces/jwt-payload.interface';
import { RefreshTokenRequestUser } from './strategies/jwt-refresh.strategy';

const AUTH_RATE_LIMITED = `More than ${THROTTLE_AUTH.limit} attempts per minute from this client`;

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
  @Throttle({ default: THROTTLE_AUTH })
  @Post('register')
  @ApiOperation({
    summary: 'Create a new account',
    description:
      'Creates the user on the FREE plan, emails a verification token, and logs them in (returns a token pair).',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthTokensResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'An account with this email already exists',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: AUTH_RATE_LIMITED,
  })
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.register(dto, this.meta(req));
  }

  @Public()
  @Throttle({ default: THROTTLE_AUTH })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: HttpStatus.OK, type: AuthTokensResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid email or password (or the account is suspended)',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: AUTH_RATE_LIMITED,
  })
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
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'Rotates the session: the refresh token used here stops working immediately, so a replayed (stolen) token is rejected.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AuthTokensResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid, expired, or already-rotated refresh token',
  })
  refresh(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() user: RefreshTokenRequestUser,
    @Req() req: Request,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(user, this.meta(req));
  }

  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({
    summary: 'Log out — revokes the current session and its refresh token',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Session revoked',
  })
  async logout(@CurrentUser() user: RequestUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify an email address using the token issued at registration',
    description: 'Tokens are single-use and expire after 24 hours.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: MessageResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired verification token',
  })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(dto);
  }

  @ApiBearerAuth('access-token')
  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseDto })
  me(@CurrentUser() user: RequestUser): Promise<UserResponseDto> {
    return this.authService.me(user.sub);
  }
}
