import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/** Swagger docs for the failure modes of any route that calls an AI provider. */
export const ApiCompletionErrors = () =>
  applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'providerId does not match an enabled provider',
    }),
    ApiResponse({
      status: HttpStatus.BAD_GATEWAY,
      description:
        'The AI provider (or, for search, the web source) rejected the call, was unreachable, or returned an unusable response',
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'No providerId given and no default provider is configured',
    }),
    ApiResponse({
      status: HttpStatus.GATEWAY_TIMEOUT,
      description: 'The AI provider (or web source) did not answer in time',
    }),
  );
