import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-only mirrors of the envelopes built by TransformInterceptor
 * (success) and AllExceptionsFilter (error). `data` is attached per route
 * by the response-envelope post-processor.
 */
export class SuccessEnvelopeDto {
  @ApiProperty({ example: true, enum: [true] })
  success: true;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Request successful' })
  message: string;

  @ApiProperty({ example: '/api/subscriptions/usage' })
  path: string;

  @ApiProperty({ example: '2026-09-29T10:15:30.000Z' })
  timestamp: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false, enum: [false] })
  success: false;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({
    example: 'Validation failed',
    description:
      'Human-readable reason. For request validation failures this is always "Validation failed" and the details are in `errors`.',
  })
  message: string;

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['email must be an email'],
    description:
      'One entry per failed validation rule; null for every other error.',
  })
  errors: string[] | null;

  @ApiProperty({ example: '/api/auth/register' })
  path: string;

  @ApiProperty({ example: '2026-09-29T10:15:30.000Z' })
  timestamp: string;
}
