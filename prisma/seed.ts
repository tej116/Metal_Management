import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Initialize clean empty settings (no dummy data sets, no default metal rates)
  await prisma.metalRate.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      goldRatePerGram: null,
      silverRatePerGram: null,
      currencySymbol: '₹',
      locale: 'en-IN',
      businessName: 'AurumLedger',
      businessAddress: '',
      businessPhone: '',
    },
  });

  await prisma.sequenceCounter.upsert({
    where: { key: 'METAL_SPLIT' },
    update: {},
    create: { key: 'METAL_SPLIT', nextValue: 1 },
  });

  await prisma.sequenceCounter.upsert({
    where: { key: 'MONEY_TRANSACTION' },
    update: {},
    create: { key: 'MONEY_TRANSACTION', nextValue: 1 },
  });

  console.log('Initialized clean database with zero dummy datasets and user-defined rates.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
