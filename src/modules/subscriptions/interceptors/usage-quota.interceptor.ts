import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';
import { SubscriptionsService } from '../subscriptions.service';

/**
 * Charges one request against the caller's plan quota before the handler
 * runs, and refunds it if the handler fails — users only pay for requests
 * that actually succeeded. Apply via `@ConsumesQuota()`.
 */
@Injectable()
export class UsageQuotaInterceptor implements NestInterceptor {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { user } = context.switchToHttp().getRequest<{ user: RequestUser }>();

    // The refund wraps only the handler: if consumeRequest itself rejects
    // (quota exhausted), nothing was charged, so nothing is given back.
    return from(this.subscriptionsService.consumeRequest(user.sub)).pipe(
      switchMap(() =>
        next
          .handle()
          .pipe(
            catchError((error: unknown) =>
              from(this.subscriptionsService.releaseRequest(user.sub)).pipe(
                switchMap(() => throwError(() => error)),
              ),
            ),
          ),
      ),
    );
  }
}
