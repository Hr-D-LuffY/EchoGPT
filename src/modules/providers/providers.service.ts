import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiProvider, HealthStatus, Prisma } from '@prisma/client';
import { PROVIDER_DEFAULT_BASE_URLS } from '../../common/constants/provider.constants';
import { EncryptionService } from '../../common/services/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { AvailableProviderResponseDto } from './dto/available-provider-response.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly adapterRegistry: ProviderAdapterRegistry,
  ) {}

  findAll(): Promise<AiProvider[]> {
    return this.prisma.aiProvider.findMany({ orderBy: { createdAt: 'asc' } });
  }

  findAllEnabled(): Promise<AiProvider[]> {
    return this.prisma.aiProvider.findMany({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findByIdOrThrow(id: string): Promise<AiProvider> {
    const provider = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  async create(dto: CreateProviderDto, actorId: string): Promise<AiProvider> {
    const { apiKey, ...fields } = dto;
    if (dto.isEnabled && !apiKey) {
      throw new BadRequestException(
        'An API key is required to enable a provider',
      );
    }

    const provider = await this.prisma.aiProvider.create({
      data: {
        ...fields,
        isEnabled: dto.isEnabled ?? false,
        apiKeyEncrypted: apiKey ? this.encryptionService.encrypt(apiKey) : null,
      },
    });

    this.logger.log(
      `Provider created: id=${provider.id} type=${provider.type} keySet=${!!apiKey} by=${actorId}`,
    );
    return provider;
  }

  /**
   * Changing the key or endpoint invalidates the last health result, so it
   * is reset to UNKNOWN rather than left showing a stale HEALTHY.
   */
  async update(
    id: string,
    dto: UpdateProviderDto,
    actorId: string,
  ): Promise<AiProvider> {
    await this.findByIdOrThrow(id);
    const { apiKey, ...fields } = dto;
    const connectionChanged = apiKey !== undefined || dto.baseUrl !== undefined;

    const data: Prisma.AiProviderUpdateInput = { ...fields };
    if (apiKey !== undefined) {
      data.apiKeyEncrypted = this.encryptionService.encrypt(apiKey);
    }
    if (connectionChanged) {
      data.lastHealthCheckStatus = HealthStatus.UNKNOWN;
      data.lastHealthCheckAt = null;
    }

    const provider = await this.prisma.aiProvider.update({
      where: { id },
      data,
    });

    this.logger.log(
      `Provider updated: id=${id} fields=[${Object.keys(dto).join(',')}] by=${actorId}`,
    );
    return provider;
  }

  async enable(id: string, actorId: string): Promise<AiProvider> {
    const provider = await this.findByIdOrThrow(id);
    if (!provider.apiKeyEncrypted) {
      throw new BadRequestException(
        'An API key is required to enable a provider',
      );
    }
    return this.setEnabled(id, true, actorId);
  }

  async disable(id: string, actorId: string): Promise<AiProvider> {
    const provider = await this.findByIdOrThrow(id);
    if (provider.isDefault) {
      throw new ConflictException(
        'Cannot disable the default provider — set another default first',
      );
    }
    return this.setEnabled(id, false, actorId);
  }

  /**
   * Global default used when a chat request doesn't name a provider.
   * Clearing *every other* row (not just rows where isDefault = true) means
   * each call locks every row, so two racing calls serialize (or one is
   * aborted by Postgres' deadlock detection) — never two defaults.
   */
  async setDefault(id: string, actorId: string): Promise<AiProvider> {
    const provider = await this.findByIdOrThrow(id);
    if (!provider.isEnabled) {
      throw new ConflictException(
        'Only an enabled provider can be the default',
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.aiProvider.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      }),
      this.prisma.aiProvider.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    this.logger.log(`Default provider set: id=${id} by=${actorId}`);
    return updated;
  }

  /** Chat messages and usage logs keep their rows (FK is ON DELETE SET NULL). */
  async remove(id: string, actorId: string): Promise<void> {
    const provider = await this.findByIdOrThrow(id);
    if (provider.isDefault) {
      throw new ConflictException(
        'Cannot delete the default provider — set another default first',
      );
    }

    await this.prisma.aiProvider.delete({ where: { id } });
    this.logger.log(
      `Provider deleted: id=${id} type=${provider.type} by=${actorId}`,
    );
  }

  async runHealthCheck(id: string): Promise<HealthCheckResponseDto> {
    const provider = await this.findByIdOrThrow(id);
    if (!provider.apiKeyEncrypted) {
      throw new BadRequestException('Provider has no API key configured');
    }

    const result = await this.adapterRegistry.get(provider.type).healthCheck({
      apiKey: this.decryptApiKey(provider),
      baseUrl: provider.baseUrl ?? PROVIDER_DEFAULT_BASE_URLS[provider.type],
    });

    const checked = await this.prisma.aiProvider.update({
      where: { id },
      data: {
        lastHealthCheckStatus: result.status,
        lastHealthCheckAt: new Date(),
      },
    });

    return {
      providerId: id,
      ...result,
      checkedAt: checked.lastHealthCheckAt,
    };
  }

  toResponse(provider: AiProvider): ProviderResponseDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      isEnabled: provider.isEnabled,
      isDefault: provider.isDefault,
      hasApiKey: provider.apiKeyEncrypted !== null,
      lastHealthCheckStatus: provider.lastHealthCheckStatus,
      lastHealthCheckAt: provider.lastHealthCheckAt,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  toAvailableResponse(provider: AiProvider): AvailableProviderResponseDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      defaultModel: provider.defaultModel,
      isDefault: provider.isDefault,
    };
  }

  private async setEnabled(
    id: string,
    isEnabled: boolean,
    actorId: string,
  ): Promise<AiProvider> {
    const provider = await this.prisma.aiProvider.update({
      where: { id },
      data: { isEnabled },
    });
    this.logger.log(
      `Provider ${isEnabled ? 'enabled' : 'disabled'}: id=${id} by=${actorId}`,
    );
    return provider;
  }

  /**
   * A decrypt failure means the stored ciphertext doesn't match the current
   * PROVIDER_KEY_ENCRYPTION_SECRET (rotated/changed) or was tampered with.
   */
  private decryptApiKey(provider: AiProvider): string {
    try {
      return this.encryptionService.decrypt(provider.apiKeyEncrypted);
    } catch (error) {
      throw new InternalServerErrorException(
        'Stored API key could not be decrypted — re-enter the key for this provider',
        { cause: error },
      );
    }
  }
}
