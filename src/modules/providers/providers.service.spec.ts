import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider, HealthStatus, ProviderType } from '@prisma/client';
import { EncryptionService } from '../../common/services/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { ProvidersService } from './providers.service';

const ADMIN_ID = 'admin-1';

function buildProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    id: 'prov-1',
    name: 'OpenAI',
    type: ProviderType.OPENAI,
    apiKeyEncrypted: 'v1:iv:tag:ct',
    baseUrl: null,
    defaultModel: null,
    isEnabled: true,
    isDefault: false,
    lastHealthCheckAt: null,
    lastHealthCheckStatus: HealthStatus.UNKNOWN,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProvidersService', () => {
  let service: ProvidersService;
  let aiProvider: Record<string, jest.Mock>;
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock };
  let adapter: { healthCheck: jest.Mock };

  beforeEach(() => {
    aiProvider = {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(({ data }) => Promise.resolve(buildProvider(data))),
      update: jest.fn(({ data }) => Promise.resolve(buildProvider(data))),
      updateMany: jest.fn(),
      delete: jest.fn(),
    };
    encryption = {
      encrypt: jest.fn((value: string) => `enc(${value})`),
      decrypt: jest.fn(() => 'plain-key'),
    };
    adapter = { healthCheck: jest.fn() };
    const prisma = {
      aiProvider,
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    service = new ProvidersService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      { get: () => adapter } as unknown as ProviderAdapterRegistry,
    );
  });

  describe('create', () => {
    it('stores only the encrypted key', async () => {
      await service.create(
        { name: 'OpenAI', type: ProviderType.OPENAI, apiKey: 'sk-secret-1' },
        ADMIN_ID,
      );

      const { data } = aiProvider.create.mock.calls[0][0];
      expect(data.apiKeyEncrypted).toBe('enc(sk-secret-1)');
      expect(data).not.toHaveProperty('apiKey');
    });

    it('rejects isEnabled=true without a key', async () => {
      await expect(
        service.create(
          { name: 'OpenAI', type: ProviderType.OPENAI, isEnabled: true },
          ADMIN_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('toResponse', () => {
    it('exposes hasApiKey but never the key or its ciphertext', () => {
      const response = service.toResponse(buildProvider());
      expect(response.hasApiKey).toBe(true);
      expect(JSON.stringify(response)).not.toContain('v1:iv:tag:ct');
      expect(response).not.toHaveProperty('apiKeyEncrypted');
    });
  });

  describe('update', () => {
    it('re-encrypts a new key and resets health to UNKNOWN', async () => {
      aiProvider.findUnique.mockResolvedValue(
        buildProvider({ lastHealthCheckStatus: HealthStatus.HEALTHY }),
      );

      await service.update('prov-1', { apiKey: 'sk-new-key-2' }, ADMIN_ID);

      const { data } = aiProvider.update.mock.calls[0][0];
      expect(data.apiKeyEncrypted).toBe('enc(sk-new-key-2)');
      expect(data.lastHealthCheckStatus).toBe(HealthStatus.UNKNOWN);
    });

    it('keeps health status when only the name changes', async () => {
      aiProvider.findUnique.mockResolvedValue(buildProvider());
      await service.update('prov-1', { name: 'Renamed' }, ADMIN_ID);
      const { data } = aiProvider.update.mock.calls[0][0];
      expect(data).toEqual({ name: 'Renamed' });
    });

    it('404s for an unknown provider', async () => {
      aiProvider.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'x' }, ADMIN_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('enable / disable / default / remove rules', () => {
    it('refuses to enable a provider without a key', async () => {
      aiProvider.findUnique.mockResolvedValue(
        buildProvider({ apiKeyEncrypted: null, isEnabled: false }),
      );
      await expect(service.enable('prov-1', ADMIN_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to disable the default provider', async () => {
      aiProvider.findUnique.mockResolvedValue(
        buildProvider({ isDefault: true }),
      );
      await expect(service.disable('prov-1', ADMIN_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to make a disabled provider the default', async () => {
      aiProvider.findUnique.mockResolvedValue(
        buildProvider({ isEnabled: false }),
      );
      await expect(
        service.setDefault('prov-1', ADMIN_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('clears every other default when setting one', async () => {
      aiProvider.findUnique.mockResolvedValue(buildProvider());
      await service.setDefault('prov-1', ADMIN_ID);
      expect(aiProvider.updateMany).toHaveBeenCalledWith({
        where: { id: { not: 'prov-1' } },
        data: { isDefault: false },
      });
    });

    it('refuses to delete the default provider', async () => {
      aiProvider.findUnique.mockResolvedValue(
        buildProvider({ isDefault: true }),
      );
      await expect(service.remove('prov-1', ADMIN_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(aiProvider.delete).not.toHaveBeenCalled();
    });
  });

  describe('runHealthCheck', () => {
    it('passes the decrypted key and default base URL, then records the result', async () => {
      aiProvider.findUnique.mockResolvedValue(buildProvider());
      adapter.healthCheck.mockResolvedValue({
        status: HealthStatus.HEALTHY,
        latencyMs: 42,
        message: null,
      });

      const result = await service.runHealthCheck('prov-1');

      expect(adapter.healthCheck).toHaveBeenCalledWith({
        apiKey: 'plain-key',
        baseUrl: 'https://api.openai.com/v1',
      });
      expect(
        aiProvider.update.mock.calls[0][0].data.lastHealthCheckStatus,
      ).toBe(HealthStatus.HEALTHY);
      expect(result).toMatchObject({ providerId: 'prov-1', status: 'HEALTHY' });
    });

    it('400s when no key is configured', async () => {
      aiProvider.findUnique.mockResolvedValue(
        buildProvider({ apiKeyEncrypted: null }),
      );
      await expect(service.runHealthCheck('prov-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('surfaces an undecryptable key as a clear 500', async () => {
      aiProvider.findUnique.mockResolvedValue(buildProvider());
      encryption.decrypt.mockImplementation(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      });
      await expect(service.runHealthCheck('prov-1')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('resolveForCompletion', () => {
    it('returns the named provider only if it is enabled', async () => {
      aiProvider.findFirst.mockResolvedValue(buildProvider());

      await service.resolveForCompletion('prov-1');

      expect(aiProvider.findFirst).toHaveBeenCalledWith({
        where: { id: 'prov-1', isEnabled: true },
      });
    });

    it('404s for an unknown or disabled provider', async () => {
      aiProvider.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveForCompletion('prov-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('falls back to the enabled default when no id is given', async () => {
      aiProvider.findFirst.mockResolvedValue(
        buildProvider({ isDefault: true }),
      );

      await service.resolveForCompletion();

      expect(aiProvider.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, isEnabled: true },
      });
    });

    it('503s when there is no default to fall back to', async () => {
      aiProvider.findFirst.mockResolvedValue(null);

      await expect(service.resolveForCompletion()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
