import { HttpStatus } from '@nestjs/common';
import { AiProvider, ProviderType, RoleName } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { EncryptionService } from '../../src/common/services/encryption.service';
import { TestApp } from './test-app';

/** Every e2e user has this shape of email, so cleanup can't touch real data. */
const E2E_EMAIL_PREFIX = 'e2e-';
const E2E_EMAIL_DOMAIN = '@example.test';
export const TEST_PASSWORD = 'S3curePassword!';

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export function uniqueEmail(tag: string): string {
  return `${E2E_EMAIL_PREFIX}${tag}-${randomUUID()}${E2E_EMAIL_DOMAIN}`;
}

export async function registerUser(http: App, tag: string): Promise<TestUser> {
  const email = uniqueEmail(tag);
  const res = await request(http)
    .post('/api/auth/register')
    .send({ email, password: TEST_PASSWORD, fullName: 'E2E User' })
    .expect(HttpStatus.CREATED);
  const { accessToken, refreshToken, user } = res.body.data;
  return { id: user.id, email, accessToken, refreshToken };
}

export async function promoteToAdmin(
  { prisma }: TestApp,
  userId: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { role: { connect: { name: RoleName.ADMIN } } },
  });
}

/** Enabled, non-default provider row backed by the FakeAiAdapter. */
export function createTestProvider({
  app,
  prisma,
}: TestApp): Promise<AiProvider> {
  return prisma.aiProvider.create({
    data: {
      name: `E2E Fake Provider ${randomUUID()}`,
      type: ProviderType.OPENAI,
      apiKeyEncrypted: app.get(EncryptionService).encrypt('sk-e2e-fake'),
      defaultModel: 'fake-model',
      isEnabled: true,
      isDefault: false,
    },
  });
}

/** Removes every e2e user (cascades sessions, subscription, chats, searches) and the given providers. */
export async function cleanupTestData(
  { prisma }: TestApp,
  providerIds: string[] = [],
): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      email: { startsWith: E2E_EMAIL_PREFIX, endsWith: E2E_EMAIL_DOMAIN },
    },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  await prisma.apiUsageLog.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { providerId: { in: providerIds } }],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.aiProvider.deleteMany({ where: { id: { in: providerIds } } });
}

export const bearer = (token: string) => ({
  Authorization: `Bearer ${token}`,
});
