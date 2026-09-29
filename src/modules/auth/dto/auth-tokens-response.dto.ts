import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class AuthTokensResponseDto {
  @ApiProperty({
    description: 'JWT for the Authorization header (Bearer). Short-lived.',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWc1YTFiMmMwMDAxeHl6OTg3NmFiY2QiLCJzZXNzaW9uSWQiOiJjbWc1YTFiMmMwMDAyeHl6OTg3NmFiY2QifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Long-lived; single-use — exchange at POST /auth/refresh.',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWc1YTFiMmMwMDAxeHl6OTg3NmFiY2QiLCJzZXNzaW9uSWQiOiJjbWc1YTFiMmMwMDAyeHl6OTg3NmFiY2QifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
