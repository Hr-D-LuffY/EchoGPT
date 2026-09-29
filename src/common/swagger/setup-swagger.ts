import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { applyResponseEnvelopes } from './response-envelope';
import { ErrorResponseDto, SuccessEnvelopeDto } from './response-envelope.dto';

export const SWAGGER_BEARER_SCHEME = 'access-token';

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('EchoGPT Backend API')
    .setDescription(
      [
        'REST API powering the EchoGPT multi-AI chat Chrome extension — auth, subscriptions, AI provider management, chat, web search, and admin operations.',
        '',
        'Every JSON response uses one envelope: `{ success, statusCode, message, path, timestamp, data }` on success and `{ success: false, statusCode, message, errors, path, timestamp }` on error.',
        '',
        'Authenticate with **Authorize** → paste the `accessToken` from `/auth/login` or `/auth/register`. Access tokens are short-lived (15 minutes by default); use `/auth/refresh` for a new pair.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      SWAGGER_BEARER_SCHEME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [SuccessEnvelopeDto, ErrorResponseDto],
  });
  return applyResponseEnvelopes(document);
}

export function setupSwagger(app: INestApplication, apiPrefix: string): void {
  SwaggerModule.setup(`${apiPrefix}/docs`, app, buildSwaggerDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}
