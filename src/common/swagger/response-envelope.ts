import { HttpStatus } from '@nestjs/common';
import { getSchemaPath, OpenAPIObject } from '@nestjs/swagger';
import {
  MediaTypeObject,
  OperationObject,
  ResponseObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { THROTTLE_DEFAULT } from '../constants/throttle.constants';
import { PUBLIC_ROUTE_EXTENSION } from '../decorators/public.decorator';
import { ErrorResponseDto, SuccessEnvelopeDto } from './response-envelope.dto';

const JSON_MEDIA_TYPE = 'application/json';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const EXAMPLE_TIMESTAMP = '2026-09-29T10:15:30.000Z';

const UNAUTHORIZED_DESCRIPTION = 'Missing or invalid access token';
const RATE_LIMITED_DESCRIPTION = `Too many requests — more than ${THROTTLE_DEFAULT.limit} per minute from this client`;

/**
 * Rewrites the generated OpenAPI document so it describes what clients
 * actually receive: every JSON success body wrapped in the
 * TransformInterceptor envelope, every error in the AllExceptionsFilter
 * shape, and the responses every route can produce (401 on protected
 * routes, 429 from the global throttler) documented once, here, instead
 * of on ~50 handlers.
 */
export function applyResponseEnvelopes(document: OpenAPIObject): OpenAPIObject {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) {
        documentOperation(operation, path);
      }
    }
  }
  return document;
}

function documentOperation(operation: OperationObject, path: string): void {
  const isPublic = operation[PUBLIC_ROUTE_EXTENSION] === true;
  delete operation[PUBLIC_ROUTE_EXTENSION];

  if (isPublic) {
    // Class-level @ApiBearerAuth() would otherwise mark public routes as locked.
    operation.security = [];
  } else {
    addResponseIfMissing(
      operation,
      HttpStatus.UNAUTHORIZED,
      UNAUTHORIZED_DESCRIPTION,
    );
  }
  addResponseIfMissing(
    operation,
    HttpStatus.TOO_MANY_REQUESTS,
    RATE_LIMITED_DESCRIPTION,
  );

  for (const [code, response] of Object.entries(operation.responses)) {
    const status = Number(code);
    if (status >= HttpStatus.BAD_REQUEST) {
      describeError(response as ResponseObject, status, path);
    } else {
      wrapSuccess(response as ResponseObject, status, path);
    }
  }
}

function addResponseIfMissing(
  operation: OperationObject,
  status: HttpStatus,
  description: string,
): void {
  operation.responses[status] ??= { description };
}

/** JSON success bodies get the envelope; 204s and SSE streams are untouched. */
function wrapSuccess(
  response: ResponseObject,
  status: number,
  path: string,
): void {
  const media: MediaTypeObject | undefined =
    response.content?.[JSON_MEDIA_TYPE];
  if (!media?.schema) {
    return;
  }

  media.schema = {
    allOf: [
      { $ref: getSchemaPath(SuccessEnvelopeDto) },
      {
        type: 'object',
        required: ['data'],
        properties: { data: media.schema },
      },
    ],
  };
  if (media.example !== undefined) {
    media.example = {
      success: true,
      statusCode: status,
      message: 'Request successful',
      path,
      timestamp: EXAMPLE_TIMESTAMP,
      data: media.example as unknown,
    };
  }
}

/** Every error body has the filter's shape; the example reuses the description. */
function describeError(
  response: ResponseObject,
  status: number,
  path: string,
): void {
  if (response.content) {
    return;
  }
  response.content = {
    [JSON_MEDIA_TYPE]: {
      schema: { $ref: getSchemaPath(ErrorResponseDto) },
      example: {
        success: false,
        statusCode: status,
        message: response.description,
        errors: null,
        path,
        timestamp: EXAMPLE_TIMESTAMP,
      },
    },
  };
}
