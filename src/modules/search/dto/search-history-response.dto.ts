import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';

export class SearchHistoryItemDto {
  @ApiProperty({ example: 'cmg6c3d4e0001qwe1234rtyu' })
  id: string;

  @ApiProperty({ example: 'How does HTTP/3 differ from HTTP/2?' })
  query: string;

  @ApiProperty({ example: '2026-09-29T10:30:00.000Z' })
  createdAt: Date;
}

export class SearchHistoryResponseDto {
  @ApiProperty({ type: [SearchHistoryItemDto] })
  items: SearchHistoryItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class RecentSearchDto {
  @ApiProperty({ example: 'How does HTTP/3 differ from HTTP/2?' })
  query: string;

  @ApiProperty({ example: '2026-09-29T10:30:00.000Z' })
  lastSearchedAt: Date;
}
