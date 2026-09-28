import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'The token emailed to the user on registration.',
  })
  @IsString()
  token: string;
}
