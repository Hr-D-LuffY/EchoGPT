import { ApiProperty } from '@nestjs/swagger';
import { MessageRole } from '@prisma/client';

export class ChatMessageResponseDto {
  @ApiProperty({ example: 'cmg5a1b2c0002xyz9876abcd' })
  id: string;

  @ApiProperty({ enum: MessageRole, example: MessageRole.ASSISTANT })
  role: MessageRole;

  @ApiProperty({
    example:
      'REST exposes fixed resource endpoints, while GraphQL exposes one endpoint where the client picks the fields it needs...',
  })
  content: string;

  @ApiProperty({
    example: 'cmg4k2x0d0001abcd1234efgh',
    nullable: true,
    type: String,
    description:
      'Provider that generated an assistant message; null for user messages',
  })
  providerId: string | null;

  @ApiProperty({
    example: 182,
    nullable: true,
    type: Number,
    description: 'Completion tokens of an assistant message, when reported',
  })
  tokenCount: number | null;

  @ApiProperty({ example: '2026-09-29T10:15:02.000Z' })
  createdAt: Date;
}
