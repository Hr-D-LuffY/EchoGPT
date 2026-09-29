import { ApiProperty } from '@nestjs/swagger';

export class UsageResponseDto {
  @ApiProperty({ example: 50 })
  requestLimit: number;

  @ApiProperty({ example: 12 })
  requestsUsed: number;

  @ApiProperty({ example: 38 })
  remainingRequests: number;

  @ApiProperty({
    example: '2026-10-29T10:00:00.000Z',
    description: 'When the usage counter resets',
  })
  periodEnd: Date;
}
