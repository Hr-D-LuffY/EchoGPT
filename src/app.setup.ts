import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/**
 * Global HTTP behaviour (prefix, CORS, validation, response/error
 * envelopes). Shared by main.ts and the e2e tests so the tested app is
 * configured exactly like the deployed one.
 */
export function configureApp(app: INestApplication): { apiPrefix: string } {
  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api';
  const corsOrigin = configService.get<string>('app.corsOrigin') ?? '*';

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({ origin: corsOrigin });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  return { apiPrefix };
}
