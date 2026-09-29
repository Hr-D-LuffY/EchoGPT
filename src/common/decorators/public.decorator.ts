import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'isPublic';

/** OpenAPI marker read by the Swagger post-processor to drop bearer auth. */
export const PUBLIC_ROUTE_EXTENSION = 'x-public';

/** Marks a route as not requiring authentication. Guards default to requiring it. */
export const Public = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    ApiExtension(PUBLIC_ROUTE_EXTENSION, true),
  );
