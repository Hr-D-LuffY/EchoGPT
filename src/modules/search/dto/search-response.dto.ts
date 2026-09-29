import { ApiProperty } from '@nestjs/swagger';

export class SearchSourceDto {
  @ApiProperty({ example: 'HTTP/3' })
  title: string;

  @ApiProperty({ example: 'https://en.wikipedia.org/wiki/HTTP%2F3' })
  url: string;

  @ApiProperty({
    example:
      'HTTP/3 is the third major version of the Hypertext Transfer Protocol... uses QUIC instead of TCP',
  })
  snippet: string;
}

export class SearchResponseDto {
  @ApiProperty({ example: 'cmg6c3d4e0001qwe1234rtyu' })
  id: string;

  @ApiProperty({ example: 'How does HTTP/3 differ from HTTP/2?' })
  query: string;

  @ApiProperty({
    example:
      'HTTP/3 runs over QUIC (UDP) instead of TCP [1], which removes head-of-line blocking between streams [1][2]...',
    description: 'AI-written answer; [n] cites sources[n-1]',
  })
  answer: string;

  @ApiProperty({ type: [SearchSourceDto] })
  sources: SearchSourceDto[];

  @ApiProperty({
    example: 'cmg4k2x0d0001abcd1234efgh',
    description: 'Provider that wrote the answer',
  })
  providerId: string;

  @ApiProperty({ example: 'gpt-4o-mini-2024-07-18' })
  model: string;

  @ApiProperty({ example: '2026-09-29T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({
    example: '2026-09-29T11:30:00.000Z',
    description: 'Until when this result is reused for the same query',
  })
  expiresAt: Date;
}

export class SearchRunResponseDto extends SearchResponseDto {
  @ApiProperty({
    example: false,
    description:
      'True when an earlier result for the same query was reused instead of calling the AI provider again',
  })
  cached: boolean;
}
