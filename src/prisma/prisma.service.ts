import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get<string>('app.databaseUrl'),
      }),
    });
  }

  async onModuleInit() {
    // With the driver-adapter architecture (Prisma 7+), $connect() only
    // initializes the adapter lazily and no longer validates real
    // connectivity. Run a trivial query so the app still fails fast at
    // boot if the database is unreachable, instead of on the first request.
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
    this.logger.log('Connected to the database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
