require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.user.deleteMany({ where: { email: 'demo@hisabpro.app' } });

  const adminEmail = 'nuhidtaufic.z@gmail.com';
  const passwordHash = await bcrypt.hash('hishab.123', 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'Nuhid Taufic Aslam',
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      plan: 'BUSINESS',
      crmStage: 'VIP',
    },
    create: {
      name: 'Nuhid Taufic Aslam',
      email: adminEmail,
      passwordHash,
      authProvider: 'LOCAL',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      plan: 'BUSINESS',
      crmStage: 'VIP',
      preferredLanguage: 'en',
    },
  });

  console.log(`Removed demo@hisabpro.app. Active SUPER_ADMIN: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
