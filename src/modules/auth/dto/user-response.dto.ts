import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 'cmg5a1b2c0001xyz9876abcd' })
  id: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName: string;

  @ApiProperty({ enum: RoleName, example: RoleName.USER })
  role: RoleName;

  @ApiProperty({ example: false })
  isEmailVerified: boolean;

  @ApiProperty({ example: '2026-09-28T16:45:00.000Z' })
  createdAt: Date;
}
