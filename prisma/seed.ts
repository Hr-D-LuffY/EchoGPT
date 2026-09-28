import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ProviderType, RoleName } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await Promise.all(
    Object.values(RoleName).map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
  console.log('Seeded roles: USER, ADMIN');

  const defaultProviders: { name: string; type: ProviderType }[] = [
    { name: 'OpenAI', type: ProviderType.OPENAI },
    { name: 'Claude (Anthropic)', type: ProviderType.CLAUDE },
    { name: 'Google Gemini', type: ProviderType.GEMINI },
  ];

  for (const provider of defaultProviders) {
    const existing = await prisma.aiProvider.findFirst({
      where: { type: provider.type },
    });
    if (!existing) {
      await prisma.aiProvider.create({
        data: { ...provider, isEnabled: false },
      });
    }
  }
  console.log(
    'Seeded default AI provider entries (disabled, no key set — configure via the admin API in Part 6)',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
