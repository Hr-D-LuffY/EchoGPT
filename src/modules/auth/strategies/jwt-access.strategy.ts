import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import {
  AccessTokenPayload,
  RequestUser,
} from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  /**
   * Re-fetches the user on every request (not just trusting the token
   * payload) so an admin suspending/deleting a user or changing their role
   * takes effect immediately, without waiting for the short-lived access
   * token to expire naturally.
   */
  async validate(payload: AccessTokenPayload): Promise<RequestUser> {
    const user = await this.usersService.findById(payload.sub);

    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is no longer active');
    }

    return {
      sub: user.id,
      sessionId: payload.sessionId,
      role: user.role.name,
      email: user.email,
    };
  }
}
