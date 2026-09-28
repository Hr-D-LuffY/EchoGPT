import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ enum: RoleName })
  role: RoleName;

  @ApiProperty()
  isEmailVerified: boolean;

  @ApiProperty()
  createdAt: Date;
}
