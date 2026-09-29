import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';

/** Class-level: every route of an admin controller is ADMIN-only. */
export const AdminOnly = () =>
  applyDecorators(
    Roles(RoleName.ADMIN),
    ApiTags('admin'),
    ApiBearerAuth('access-token'),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid access token',
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Caller is not an admin',
    }),
  );
