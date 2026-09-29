import { Injectable, Logger } from '@nestjs/common';
import { UsageCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface UsageLogEntry {
  userId: string;
  providerId: string | null;
  category: UsageCategory;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  tokensUsed: number | null;
}

/** Writes `ApiUsageLog` rows — the data behind Part 9's usage analytics. */
@Injectable()
export class UsageLogsService {
  private readonly logger = new Logger(UsageLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A failed log write is reported but not rethrown: the user's request
   * (and the provider tokens it already spent) succeeded, and failing it
   * now would refund a quota unit for work that was actually delivered.
   */
  async record(entry: UsageLogEntry): Promise<void> {
    try {
      await this.prisma.apiUsageLog.create({ data: entry });
    } catch (error) {
      this.logger.error(
        `Failed to record usage log: user=${entry.userId} endpoint=${entry.endpoint} status=${entry.statusCode}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
