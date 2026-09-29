import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  static of(page: number, limit: number, total: number): PaginationMetaDto {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
  }
}
