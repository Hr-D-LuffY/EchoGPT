import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';
import { ChatSummaryResponseDto } from './chat-summary-response.dto';

export class ChatListResponseDto {
  @ApiProperty({ type: [ChatSummaryResponseDto] })
  items: ChatSummaryResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
