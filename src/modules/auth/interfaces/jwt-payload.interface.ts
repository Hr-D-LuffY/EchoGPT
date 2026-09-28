import { RoleName } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  role: RoleName;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
}

/** Shape attached to `req.user` once the access token has been validated. */
export type RequestUser = AccessTokenPayload;
