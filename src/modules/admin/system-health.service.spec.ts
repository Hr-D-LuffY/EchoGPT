import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthStatus, ProviderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { ComponentStatus, SystemStatus } from './dto/system-health.dto';
import { SystemHealthService } from './system-health.service';

function buildProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prov-1',
    name: 'OpenAI',
    type: ProviderType.OPENAI,
    isDefault: true,
    lastHealthCheckStatus: HealthStatus.HEALTHY,
    lastHealthCheckAt: new Date(),
    ...overrides,
  };
}

describe('SystemHealthService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let providers: { findAllEnabled: jest.Mock; runHealthCheck: jest.Mock };
  let service: SystemHealthService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    providers = {
      findAllEnabled: jest.fn().mockResolvedValue([buildProvider()]),
      runHealthCheck: jest.fn(),
    };
    service = new SystemHealthService(
      prisma as unknown as PrismaService,
      providers as unknown as ProvidersService,
      { get: () => 'test' } as unknown as ConfigService,
    );
  });

  it('is ok with the database up and a healthy default provider', async () => {
    const health = await service.getSystemHealth(false);

    expect(health.status).toBe(SystemStatus.OK);
    expect(health.database.status).toBe(ComponentStatus.UP);
    expect(providers.runHealthCheck).not.toHaveBeenCalled();
  });

  it('reports a database failure as down instead of throwing', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const health = await service.getSystemHealth(false);

    expect(health.status).toBe(SystemStatus.DOWN);
    expect(health.database.status).toBe(ComponentStatus.DOWN);
  });

  it('is degraded without an enabled default provider', async () => {
    providers.findAllEnabled.mockResolvedValue([
      buildProvider({ isDefault: false }),
    ]);

    expect((await service.getSystemHealth(false)).status).toBe(
      SystemStatus.DEGRADED,
    );
  });

  it('check=true runs live checks and reports a check that cannot run', async () => {
    providers.findAllEnabled.mockResolvedValue([
      buildProvider(),
      buildProvider({ id: 'prov-2', isDefault: false }),
    ]);
    providers.runHealthCheck
      .mockResolvedValueOnce({
        status: HealthStatus.HEALTHY,
        checkedAt: new Date(),
        message: null,
      })
      .mockRejectedValueOnce(
        new InternalServerErrorException(
          'Stored API key could not be decrypted',
        ),
      );

    const health = await service.getSystemHealth(true);

    expect(providers.runHealthCheck).toHaveBeenCalledTimes(2);
    expect(health.providers[1]).toMatchObject({
      status: HealthStatus.UNHEALTHY,
      message: 'Stored API key could not be decrypted',
    });
    expect(health.status).toBe(SystemStatus.DEGRADED);
  });

  it('liveness exposes only status, database, uptime', async () => {
    const liveness = await service.getLiveness();

    expect(Object.keys(liveness).sort()).toEqual([
      'database',
      'status',
      'timestamp',
      'uptimeSeconds',
    ]);
  });
});
