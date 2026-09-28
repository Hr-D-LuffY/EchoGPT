import { Injectable, Logger } from '@nestjs/common';

/**
 * Stub — logs instead of sending. Swap the body of each method for a real
 * provider (SES, Resend, Postmark, etc.) when one is wired up; callers
 * don't need to change.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    this.logger.log(
      `[stub email] Verification link for ${to} — token: ${token}`,
    );
  }
}
