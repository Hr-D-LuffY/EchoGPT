import { ApiProperty } from '@nestjs/swagger';

export class ChatSummaryResponseDto {
  @ApiProperty({ example: 'cmg5a1b2c0001xyz9876abcd' })
  id: string;

  @ApiProperty({
    example: 'Summarize the key differences between REST and GraphQL.',
    nullable: true,
    type: String,
  })
  title: string | null;

  @ApiProperty({ example: 6 })
  messageCount: number;

  @ApiProperty({ example: '2026-09-29T10:15:00.000Z' })
  createdAt: Date;

  @ApiProperty({
    example: '2026-09-29T10:21:44.000Z',
    description: 'Time of the latest exchange',
  })
  updatedAt: Date;
}
