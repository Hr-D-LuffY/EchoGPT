import { Module } from '@nestjs/common';
import { UsageLogsService } from './usage-logs.service';

@Module({
  providers: [UsageLogsService],
  exports: [UsageLogsService],
})
export class UsageLogsModule {}
