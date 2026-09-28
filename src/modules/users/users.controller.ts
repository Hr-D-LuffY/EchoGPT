import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: "Get the current user's profile" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async getProfile(@CurrentUser() user: RequestUser): Promise<UserResponseDto> {
    const record = await this.usersService.findById(user.sub);
    if (!record) {
      throw new NotFoundException('User not found');
    }
    return this.usersService.toSafeUser(record);
  }

  @Patch('profile')
  @ApiOperation({ summary: "Update the current user's profile" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const updated = await this.usersService.updateProfile(user.sub, dto);
    return this.usersService.toSafeUser(updated);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Change the current user's password (revokes all other sessions)",
  })
  @ApiResponse({ status: 204, description: 'Password changed' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description:
      'Current password is incorrect, or missing/invalid access token',
  })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword(
      user.sub,
      user.sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete the current account (requires password confirmation)',
  })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @ApiResponse({
    status: 401,
    description: 'Incorrect password, or missing/invalid access token',
  })
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.usersService.deleteAccount(user.sub, dto.password);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: "Get any user's profile by id (admin only)" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.usersService.findByIdForAdmin(id);
    return this.usersService.toSafeUser(user);
  }
}
