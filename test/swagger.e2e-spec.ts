import { HttpStatus } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import {
  OperationObject,
  ParameterObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { buildSwaggerDocument } from '../src/common/swagger/setup-swagger';
import { createTestApp, TestApp } from './utils/test-app';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const JSON_MEDIA_TYPE = 'application/json';

interface Operation {
  id: string;
  op: OperationObject;
}

/**
 * Documentation-quality rules for every endpoint (CLAUDE.md "Swagger/API
 * docs"). Failing here means a route shipped without its docs.
 */
describe('Swagger document (e2e)', () => {
  let t: TestApp;
  let doc: OpenAPIObject;
  let operations: Operation[];

  beforeAll(async () => {
    t = await createTestApp();
    doc = buildSwaggerDocument(t.app);
    operations = Object.entries(doc.paths).flatMap(([path, item]) =>
      METHODS.filter((m) => item[m]).map((m) => ({
        id: `${m.toUpperCase()} ${path}`,
        op: item[m]!,
      })),
    );
  });

  afterAll(() => t.app.close());

  const resolve = (schema: SchemaObject | ReferenceObject): SchemaObject =>
    '$ref' in schema
      ? resolve(doc.components!.schemas![schema.$ref.split('/').pop()!])
      : schema;

  const isPublic = (op: OperationObject) => op.security?.length === 0;

  /** Collects "<operation>" for every operation the predicate flags. */
  const offenders = (flag: (op: OperationObject) => boolean) =>
    operations.filter(({ op }) => flag(op)).map(({ id }) => id);

  it('documents a meaningful number of routes', () => {
    expect(operations.length).toBeGreaterThan(40);
  });

  it('gives every operation a tag and a summary', () => {
    expect(offenders((op) => !op.tags?.length || !op.summary)).toEqual([]);
  });

  it('documents a success response for every operation', () => {
    expect(
      offenders((op) => !Object.keys(op.responses).some((c) => c < '300')),
    ).toEqual([]);
  });

  it('documents 400 on every route that validates a body or query', () => {
    const takesInput = (op: OperationObject) =>
      op.requestBody !== undefined ||
      ((op.parameters ?? []) as ParameterObject[]).some(
        (p) => p.in === 'query',
      );
    expect(
      offenders(
        (op) => takesInput(op) && !op.responses[HttpStatus.BAD_REQUEST],
      ),
    ).toEqual([]);
  });

  it('requires bearer auth and documents 401 on every non-public route', () => {
    expect(
      offenders(
        (op) =>
          !isPublic(op) &&
          (!op.security?.length || !op.responses[HttpStatus.UNAUTHORIZED]),
      ),
    ).toEqual([]);
  });

  it('marks exactly the intended routes public', () => {
    const publicRoutes = operations
      .filter(({ op }) => isPublic(op))
      .map(({ id }) => id)
      .sort();
    expect(publicRoutes).toEqual([
      'GET /api/health',
      'GET /api/subscriptions/plans',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/register',
      'POST /api/auth/verify-email',
    ]);
  });

  it('wraps every JSON success body in the response envelope', () => {
    expect(
      offenders((op) =>
        Object.entries(op.responses).some(([code, res]) => {
          const schema = (res as ResponseObject).content?.[JSON_MEDIA_TYPE]
            ?.schema as SchemaObject | undefined;
          return code < '300' && schema !== undefined && !schema.allOf;
        }),
      ),
    ).toEqual([]);
  });

  it('gives every error response the error schema and an example', () => {
    expect(
      offenders((op) =>
        Object.entries(op.responses).some(([code, res]) => {
          const media = (res as ResponseObject).content?.[JSON_MEDIA_TYPE];
          return code >= '400' && (!media?.schema || !media.example);
        }),
      ),
    ).toEqual([]);
  });

  it('has an example for every request body property', () => {
    const missing = operations.flatMap(({ id, op }) => {
      const body = op.requestBody as RequestBodyObject | undefined;
      const schema = body?.content[JSON_MEDIA_TYPE]?.schema;
      if (!schema) {
        return [];
      }
      return Object.entries(resolve(schema).properties ?? {})
        .filter(([, prop]) => {
          const p = resolve(prop);
          return p.example === undefined && !p.enum && !('$ref' in prop);
        })
        .map(([name]) => `${id} body.${name}`);
    });
    expect(missing).toEqual([]);
  });

  it('has an example or enum for every query parameter', () => {
    const missing = operations.flatMap(({ id, op }) =>
      ((op.parameters ?? []) as ParameterObject[])
        .filter((p) => p.in === 'query')
        .filter((p) => {
          const schema = p.schema && resolve(p.schema);
          return (
            p.example === undefined &&
            schema?.example === undefined &&
            !schema?.enum
          );
        })
        .map((p) => `${id} ?${p.name}`),
    );
    expect(missing).toEqual([]);
  });
});
