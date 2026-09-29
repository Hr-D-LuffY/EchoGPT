import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ProviderAdapterRegistry } from '../../src/modules/providers/adapters/provider-adapter.registry';
import { WikipediaClient } from '../../src/modules/search/sources/wikipedia.client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FakeAiAdapter } from './fake-ai-adapter';
import { FakeWikipediaClient } from './fake-wikipedia';

export interface TestApp {
  app: INestApplication<App>;
  http: App;
  prisma: PrismaService;
  fakeAi: FakeAiAdapter;
}

/**
 * The real AppModule (real DB from DATABASE_URL, real guards, pipes,
 * filters, interceptors) with only the external HTTP boundaries faked —
 * AI vendors and the Wikipedia search source — so no network or keys are
 * needed. Each call builds a fresh app, so throttler counters start at
 * zero per test file.
 */
export async function createTestApp(): Promise<TestApp> {
  const fakeAi = new FakeAiAdapter();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ProviderAdapterRegistry)
    .useValue({ get: () => fakeAi })
    .overrideProvider(WikipediaClient)
    .useValue(new FakeWikipediaClient())
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return {
    app,
    http: app.getHttpServer(),
    prisma: app.get(PrismaService),
    fakeAi,
  };
}
