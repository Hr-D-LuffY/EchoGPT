import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { AvailableProviderResponseDto } from './dto/available-provider-response.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProvidersService } from './providers.service';

@ApiTags('providers')
@ApiBearerAuth('access-token')
@Roles(RoleName.ADMIN)
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'Missing or invalid access token',
})
@ApiResponse({
  status: HttpStatus.FORBIDDEN,
  description: 'Caller is not an admin (all routes except /available)',
})
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get('available')
  @Roles(RoleName.USER, RoleName.ADMIN)
  @ApiOperation({
    summary: 'List enabled providers the current user can chat with',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [AvailableProviderResponseDto] })
  async listAvailable(): Promise<AvailableProviderResponseDto[]> {
    const providers = await this.providersService.findAllEnabled();
    return providers.map((p) => this.providersService.toAvailableResponse(p));
  }

  @Get()
  @ApiOperation({ summary: 'List all providers (admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: [ProviderResponseDto] })
  async findAll(): Promise<ProviderResponseDto[]> {
    const providers = await this.providersService.findAll();
    return providers.map((p) => this.providersService.toResponse(p));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a provider by id (admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: ProviderResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
  })
  async findOne(@Param('id') id: string): Promise<ProviderResponseDto> {
    const provider = await this.providersService.findByIdOrThrow(id);
    return this.providersService.toResponse(provider);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a provider (admin). The API key is stored encrypted.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ProviderResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed, or isEnabled=true without an apiKey',
  })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateProviderDto,
  ): Promise<ProviderResponseDto> {
    const provider = await this.providersService.create(dto, user.sub);
    return this.providersService.toResponse(provider);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit a provider (admin). Changing apiKey/baseUrl resets health to UNKNOWN.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProviderResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
  })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    const provider = await this.providersService.update(id, dto, user.sub);
    return this.providersService.toResponse(provider);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable a provider (admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: ProviderResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Provider has no API key configured',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
  })
  async enable(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ProviderResponseDto> {
    const provider = await this.providersService.enable(id, user.sub);
    return this.providersService.toResponse(provider);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable a provider (admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: ProviderResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Provider is the current default',
  })
  async disable(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ProviderResponseDto> {
    const provider = await this.providersService.disable(id, user.sub);
    return this.providersService.toResponse(provider);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make this the global default provider (admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: ProviderResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Provider is disabled',
  })
  async setDefault(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ProviderResponseDto> {
    const provider = await this.providersService.setDefault(id, user.sub);
    return this.providersService.toResponse(provider);
  }

  @Post(':id/health-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Ping the provider's model-list endpoint and record the result (admin)",
  })
  @ApiResponse({ status: HttpStatus.OK, type: HealthCheckResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Provider has no API key configured',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
  })
  runHealthCheck(@Param('id') id: string): Promise<HealthCheckResponseDto> {
    return this.providersService.runHealthCheck(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a provider (admin). Chat history keeps its messages.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Provider deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Provider is the current default',
  })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.providersService.remove(id, user.sub);
  }
}
