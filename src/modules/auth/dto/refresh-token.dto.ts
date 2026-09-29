import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token issued at login/register.',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWc1YTFiMmMwMDAxeHl6OTg3NmFiY2QiLCJzZXNzaW9uSWQiOiJjbWc1YTFiMmMwMDAyeHl6OTg3NmFiY2QifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  })
  @IsString()
  refreshToken: string;
}
