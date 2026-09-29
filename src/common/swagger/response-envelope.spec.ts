import { HttpStatus } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import {
  OperationObject,
  ResponseObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { PUBLIC_ROUTE_EXTENSION } from '../decorators/public.decorator';
import { applyResponseEnvelopes } from './response-envelope';

const DTO_REF = { $ref: '#/components/schemas/ThingDto' };

function documentWith(path: string, operation: OperationObject): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: { [path]: { get: operation } },
  };
}

function process(operation: OperationObject, path = '/api/things') {
  const doc = applyResponseEnvelopes(documentWith(path, operation));
  return doc.paths[path].get!;
}

const response = (op: OperationObject, status: number) =>
  op.responses[status] as ResponseObject;

describe('applyResponseEnvelopes', () => {
  it('wraps a JSON success schema in the success envelope', () => {
    const op = process({
      security: [{ 'access-token': [] }],
      responses: {
        200: {
          description: '',
          content: { 'application/json': { schema: DTO_REF } },
        },
      },
    });

    expect(response(op, 200).content!['application/json'].schema).toEqual({
      allOf: [
        { $ref: '#/components/schemas/SuccessEnvelopeDto' },
        {
          type: 'object',
          required: ['data'],
          properties: { data: DTO_REF },
        },
      ],
    });
  });

  it('wraps an explicit success example too', () => {
    const op = process({
      responses: {
        200: {
          description: '',
          content: {
            'application/json': {
              schema: { type: 'array' },
              example: ['a', 'b'],
            },
          },
        },
      },
    });

    expect(
      response(op, 200).content!['application/json'].example,
    ).toMatchObject({
      success: true,
      statusCode: 200,
      path: '/api/things',
      data: ['a', 'b'],
    });
  });

  it('leaves 204s and non-JSON (SSE) responses alone', () => {
    const sse = { 'text/event-stream': { schema: { type: 'string' } } };
    const op = process({
      responses: {
        201: { description: 'stream', content: sse },
        204: { description: 'deleted' },
      },
    });

    expect(response(op, 201).content).toBe(sse);
    expect(response(op, 204).content).toBeUndefined();
  });

  it('gives every error the error schema with the description as the example message', () => {
    const op = process({
      responses: { 404: { description: 'Thing not found' } },
    });

    expect(response(op, 404).content!['application/json']).toEqual({
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      example: expect.objectContaining({
        success: false,
        statusCode: 404,
        message: 'Thing not found',
        errors: null,
        path: '/api/things',
      }),
    });
  });

  it('adds 401 and 429 to protected routes without overriding existing docs', () => {
    const op = process({
      security: [{ 'access-token': [] }],
      responses: {
        200: { description: 'ok' },
        429: { description: 'Quota used up' },
      },
    });

    expect(response(op, HttpStatus.UNAUTHORIZED)).toBeDefined();
    expect(response(op, HttpStatus.TOO_MANY_REQUESTS).description).toBe(
      'Quota used up',
    );
  });

  it('strips bearer auth from @Public() routes and adds no 401', () => {
    const publicOp: OperationObject = {
      security: [{ 'access-token': [] }],
      responses: { 200: { description: 'ok' } },
    };
    publicOp[PUBLIC_ROUTE_EXTENSION] = true;
    const op = process(publicOp);

    expect(op.security).toEqual([]);
    expect(op[PUBLIC_ROUTE_EXTENSION]).toBeUndefined();
    expect(op.responses[HttpStatus.UNAUTHORIZED]).toBeUndefined();
    expect(op.responses[HttpStatus.TOO_MANY_REQUESTS]).toBeDefined();
  });
});
