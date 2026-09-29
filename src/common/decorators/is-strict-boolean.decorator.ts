import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * `@IsBoolean()` for request bodies that only accepts real JSON booleans.
 * The global ValidationPipe's implicit conversion would otherwise turn any
 * non-empty string — including "false" — into `true` before validation.
 */
export const IsStrictBoolean = () =>
  applyDecorators(
    Transform(({ obj, key }) => (obj as Record<string, unknown>)[key]),
    IsBoolean(),
  );
