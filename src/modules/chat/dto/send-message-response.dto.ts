import { ApiProperty } from '@nestjs/swagger';
import { ChatMessageResponseDto } from './chat-message-response.dto';
import { TokenUsageDto } from './token-usage.dto';

export class SendMessageResponseDto {
  @ApiProperty({ example: 'cmg5a1b2c0001xyz9876abcd' })
  chatId: string;

  @ApiProperty({
    example: 'Summarize the key differences between REST and GraphQL.',
    nullable: true,
    type: String,
  })
  title: string | null;

  @ApiProperty({ example: 'gpt-4o-mini-2024-07-18' })
  model: string;

  @ApiProperty({ type: ChatMessageResponseDto })
  userMessage: ChatMessageResponseDto;

  @ApiProperty({ type: ChatMessageResponseDto })
  assistantMessage: ChatMessageResponseDto;

  @ApiProperty({ type: TokenUsageDto })
  usage: TokenUsageDto;
}
