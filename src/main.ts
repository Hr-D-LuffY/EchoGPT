import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { setupSwagger } from './common/swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { apiPrefix } = configureApp(app);
  setupSwagger(app, apiPrefix);

  const port = app.get(ConfigService).get<number>('app.port') ?? 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Application running on: http://localhost:${port}/${apiPrefix}`);
  logger.log(
    `Swagger docs available at: http://localhost:${port}/${apiPrefix}/docs`,
  );
}
bootstrap();
