import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RefreshTokenPayload } from '../interfaces/jwt-payload.interface';

export interface RefreshTokenRequestUser extends RefreshTokenPayload {
  refreshToken: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: RefreshTokenPayload,
  ): RefreshTokenRequestUser {
    const refreshToken = (req.body as { refreshToken?: string })?.refreshToken;
    return { ...payload, refreshToken: refreshToken ?? '' };
  }
}
