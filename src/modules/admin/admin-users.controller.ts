import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { AdminUsersService } from './admin-users.service';
import { AdminOnly } from './decorators/admin-only.decorator';
import {
  AdminUserDetailResponseDto,
  AdminUserListResponseDto,
  AdminUserResponseDto,
  ListUsersQueryDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-user.dto';

@AdminOnly()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List / search users (admin)',
    description:
      'Newest first. `search` matches email or full name. Deleted accounts are excluded.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AdminUserListResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid filter or pagination value',
  })
  list(@Query() query: ListUsersQueryDto): Promise<AdminUserListResponseDto> {
    return this.adminUsersService.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'User detail with subscription and activity counts (admin)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AdminUserDetailResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  getDetail(@Param('id') id: string): Promise<AdminUserDetailResponseDto> {
    return this.adminUsersService.getDetail(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Suspend or reactivate a user (admin)',
    description:
      'SUSPENDED blocks the user immediately and revokes all their sessions. Idempotent.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AdminUserResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid status, or targeting your own account',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  updateStatus(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUsersService.updateStatus(id, dto.status, admin.sub);
  }

  @Patch(':id/role')
  @ApiOperation({
    summary: "Change a user's role (admin)",
    description:
      "Takes effect on the user's next request. You can't change your own role. Idempotent.",
  })
  @ApiResponse({ status: HttpStatus.OK, type: AdminUserResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid role, or targeting your own account',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  updateRole(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUsersService.updateRole(id, dto.role, admin.sub);
  }
}
