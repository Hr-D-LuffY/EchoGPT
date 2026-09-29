import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CHAT_MESSAGE_MAX_LENGTH } from '../../../common/constants/chat.constants';

export class SendMessageDto {
  @ApiProperty({
    example: 'Summarize the key differences between REST and GraphQL.',
    maxLength: CHAT_MESSAGE_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_MESSAGE_MAX_LENGTH)
  content: string;

  @ApiPropertyOptional({
    example: 'cmg5a1b2c0001xyz9876abcd',
    description: 'Continue this conversation. Omit to start a new one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chatId?: string;

  @ApiPropertyOptional({
    example: 'cmg4k2x0d0001abcd1234efgh',
    description:
      'An id from GET /providers/available. Omit to use the default provider.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  providerId?: string;
}
