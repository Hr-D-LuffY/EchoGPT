import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, HealthStatus } from '@prisma/client';
import { BYTES_PER_MEGABYTE } from '../../common/constants/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import {
  ComponentStatus,
  DatabaseHealthDto,
  LivenessResponseDto,
  ProviderHealthDto,
  SystemHealthResponseDto,
  SystemStatus,
} from './dto/system-health.dto';

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providersService: ProvidersService,
    private readonly configService: ConfigService,
  ) {}

  /** Minimal public probe for load balancers: no component details. */
  async getLiveness(): Promise<LivenessResponseDto> {
    const database = await this.checkDatabase();
    return {
      status:
        database.status === ComponentStatus.UP
          ? SystemStatus.OK
          : SystemStatus.DOWN,
      database: database.status,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date(),
    };
  }

  async getSystemHealth(
    runProviderChecks: boolean,
  ): Promise<SystemHealthResponseDto> {
    const [database, providers] = await Promise.all([
      this.checkDatabase(),
      this.providerHealth(runProviderChecks),
    ]);
    const { rss, heapUsed } = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    return {
      status: this.overallStatus(database, providers),
      uptimeSeconds: Math.round(uptimeSeconds),
      startedAt: new Date(Date.now() - uptimeSeconds * 1000),
      environment: this.configService.get<string>('app.env') ?? 'development',
      nodeVersion: process.version,
      memory: {
        rssMb: this.toMegabytes(rss),
        heapUsedMb: this.toMegabytes(heapUsed),
      },
      database,
      providers,
      timestamp: new Date(),
    };
  }

  /**
   * An unreachable database is the *answer* of a health check, so it is
   * reported as DOWN (and logged) rather than thrown.
   */
  private async checkDatabase(): Promise<DatabaseHealthDto> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: ComponentStatus.UP, latencyMs: Date.now() - startedAt };
    } catch (error) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: ComponentStatus.DOWN,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async providerHealth(
    runChecks: boolean,
  ): Promise<ProviderHealthDto[]> {
    const providers = await this.providersService.findAllEnabled();
    return Promise.all(
      providers.map((provider) =>
        runChecks ? this.checkProviderLive(provider) : this.lastKnown(provider),
      ),
    );
  }

  /**
   * Uses the Part 6 health check, which also records the result. A check
   * that can't even run (e.g. the stored key no longer decrypts) is
   * reported as UNHEALTHY with the reason.
   */
  private async checkProviderLive(
    provider: AiProvider,
  ): Promise<ProviderHealthDto> {
    try {
      const result = await this.providersService.runHealthCheck(provider.id);
      return {
        ...this.lastKnown(provider),
        status: result.status,
        checkedAt: result.checkedAt,
        message: result.message,
      };
    } catch (error) {
      return {
        ...this.lastKnown(provider),
        status: HealthStatus.UNHEALTHY,
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private lastKnown(provider: AiProvider): ProviderHealthDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      isDefault: provider.isDefault,
      status: provider.lastHealthCheckStatus,
      checkedAt: provider.lastHealthCheckAt,
      message: null,
    };
  }

  /**
   * DOWN: nothing works without the database. DEGRADED: chat/search can
   * fail — there's no enabled default, or an enabled provider isn't known
   * to be HEALTHY.
   */
  private overallStatus(
    database: DatabaseHealthDto,
    providers: ProviderHealthDto[],
  ): SystemStatus {
    if (database.status === ComponentStatus.DOWN) {
      return SystemStatus.DOWN;
    }
    const hasDefault = providers.some((p) => p.isDefault);
    const allHealthy = providers.every(
      (p) => p.status === HealthStatus.HEALTHY,
    );
    return hasDefault && allHealthy ? SystemStatus.OK : SystemStatus.DEGRADED;
  }

  private toMegabytes(bytes: number): number {
    return Math.round((bytes / BYTES_PER_MEGABYTE) * 10) / 10;
  }
}
