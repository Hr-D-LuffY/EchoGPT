import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { SubscriptionsService } from '../subscriptions.service';
import { UsageQuotaInterceptor } from './usage-quota.interceptor';

const USER_ID = 'user-1';

describe('UsageQuotaInterceptor', () => {
  let service: { consumeRequest: jest.Mock; releaseRequest: jest.Mock };
  let interceptor: UsageQuotaInterceptor;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: USER_ID } }) }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    service = {
      consumeRequest: jest.fn().mockResolvedValue(undefined),
      releaseRequest: jest.fn().mockResolvedValue(undefined),
    };
    interceptor = new UsageQuotaInterceptor(
      service as unknown as SubscriptionsService,
    );
  });

  it('charges one request and passes the handler result through', async () => {
    const next: CallHandler = { handle: () => of('ok') };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).resolves.toBe('ok');
    expect(service.consumeRequest).toHaveBeenCalledWith(USER_ID);
    expect(service.releaseRequest).not.toHaveBeenCalled();
  });

  it('refunds the request and rethrows when the handler fails', async () => {
    const failure = new Error('provider down');
    const next: CallHandler = { handle: () => throwError(() => failure) };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(failure);
    expect(service.releaseRequest).toHaveBeenCalledWith(USER_ID);
  });

  it('does not run the handler or refund when the quota is exhausted', async () => {
    const quotaError = new HttpException(
      'Request limit reached',
      HttpStatus.TOO_MANY_REQUESTS,
    );
    service.consumeRequest.mockRejectedValue(quotaError);
    const handle = jest.fn(() => of('ok'));

    await expect(
      lastValueFrom(interceptor.intercept(context, { handle })),
    ).rejects.toBe(quotaError);
    expect(handle).not.toHaveBeenCalled();
    expect(service.releaseRequest).not.toHaveBeenCalled();
  });
});
