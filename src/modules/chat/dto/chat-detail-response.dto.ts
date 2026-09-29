import { ApiProperty } from '@nestjs/swagger';
import { ChatMessageResponseDto } from './chat-message-response.dto';

export class ChatDetailResponseDto {
  @ApiProperty({ example: 'cmg5a1b2c0001xyz9876abcd' })
  id: string;

  @ApiProperty({
    example: 'Summarize the key differences between REST and GraphQL.',
    nullable: true,
    type: String,
  })
  title: string | null;

  @ApiProperty({ example: '2026-09-29T10:15:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-29T10:21:44.000Z' })
  updatedAt: Date;

  @ApiProperty({
    type: [ChatMessageResponseDto],
    description: 'Oldest first',
  })
  messages: ChatMessageResponseDto[];
}
