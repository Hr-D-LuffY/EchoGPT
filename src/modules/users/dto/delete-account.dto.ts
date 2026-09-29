import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Current password, required to confirm account deletion.',
    example: 'S3curePassword!',
  })
  @IsString()
  password: string;
}
