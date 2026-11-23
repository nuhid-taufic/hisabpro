require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const tk = (amt) => BigInt(Math.round(amt * 100));

async function main() {
  const email = 'demo@hisabpro.app';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Demo account already exists.');
    return;
  }

  const passwordHash = await bcrypt.hash('Demo@1234', 12);
  const user = await prisma.user.create({
    data: { name: 'Nuhid Aslam', email, passwordHash, baseCurrency: 'BDT' },
  });

  const [personalBook, storeBook] = await Promise.all([
    prisma.ledgerBook.create({
      data: { userId: user.id, name: 'Personal', bookType: 'PERSONAL', isDefault: true },
    }),
    prisma.ledgerBook.create({
      data: { userId: user.id, name: 'My Store', bookType: 'STORE', isDefault: false },
    }),
  ]);

  const [cash, bkash, dbbl, cashBox] = await Promise.all([
    prisma.wallet.create({
      data: { userId: user.id, name: 'Cash', type: 'CASH', openingBalancePaisa: tk(4500), balancePaisa: tk(4280) },
    }),
    prisma.wallet.create({
      data: { userId: user.id, name: 'bKash', type: 'MFS', openingBalancePaisa: tk(12500), balancePaisa: tk(12000) },
    }),
    prisma.wallet.create({
      data: { userId: user.id, name: 'DBBL', type: 'BANK', openingBalancePaisa: tk(8000), balancePaisa: tk(23000) },
    }),
    prisma.wallet.create({
      data: { userId: user.id, name: 'Shop Cash Box', type: 'CASH', openingBalancePaisa: tk(5000), balancePaisa: tk(7200) },
    }),
  ]);

  const catSeed = [
    { name: 'Food', isIncome: false },
    { name: 'Transport', isIncome: false },
    { name: 'Bills & Utilities', isIncome: false },
    { name: 'Shop Expense', isIncome: false },
    { name: 'Freelance', isIncome: true },
    { name: 'Store Sales', isIncome: true },
  ];
  const cats = await Promise.all(
    catSeed.map((c) => prisma.category.create({ data: { userId: user.id, ...c } }))
  );
  const foodCat = cats.find((c) => c.name === 'Food');
  const freelanceCat = cats.find((c) => c.name === 'Freelance');

  const rahim = await prisma.contact.create({
    data: {
      userId: user.id,
      name: 'Rahim Uddin',
      phone: '01711889900',
      type: 'CUSTOMER',
      address: 'Station Road, Rangpur',
      netBalancePaisa: tk(1400),
      shareToken: 'rh-demo-9x4k2m',
      isShareEnabled: true,
    },
  });

  const karim = await prisma.contact.create({
    data: {
      userId: user.id,
      name: 'Karim Telecom Wholesale',
      phone: '01819223344',
      type: 'SUPPLIER',
      address: 'Gulistan Market, Dhaka',
      netBalancePaisa: tk(-1500),
    },
  });

  const [charger, earbuds, glass] = await Promise.all([
    prisma.product.create({
      data: {
        userId: user.id,
        bookId: storeBook.id,
        name: 'Type-C 65W Fast Charger',
        sku: 'CHG-65W',
        unit: 'pcs',
        costPricePaisa: tk(350),
        mrpPricePaisa: tk(500),
        minSellPricePaisa: tk(400),
        currentStock: 4,
        lowStockLimit: 5,
      },
    }),
    prisma.product.create({
      data: {
        userId: user.id,
        bookId: storeBook.id,
        name: 'TWS Pro Earbuds',
        sku: 'EAR-TWS',
        unit: 'pcs',
        costPricePaisa: tk(900),
        mrpPricePaisa: tk(1350),
        minSellPricePaisa: tk(1050),
        currentStock: 14,
        lowStockLimit: 4,
      },
    }),
    prisma.product.create({
      data: {
        userId: user.id,
        bookId: storeBook.id,
        name: 'Matte Tempered Glass',
        sku: 'GLS-MT',
        unit: 'pcs',
        costPricePaisa: tk(45),
        mrpPricePaisa: tk(150),
        currentStock: 42,
        lowStockLimit: 10,
      },
    }),
    prisma.product.create({
      data: {
        userId: user.id,
        bookId: storeBook.id,
        name: 'Old Micro-USB OTG Adapter',
        sku: 'OTG-OLD',
        unit: 'pcs',
        costPricePaisa: tk(35),
        mrpPricePaisa: tk(80),
        currentStock: 19,
        lowStockLimit: 5,
      },
    }),
  ]);

  const hangoutTag = await prisma.tag.create({ data: { userId: user.id, name: 'hangout' } });
  const fiverrTag = await prisma.tag.create({ data: { userId: user.id, name: 'fiverr' } });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      bookId: personalBook.id,
      type: 'LEND',
      amountPaisa: tk(500),
      walletId: bkash.id,
      contactId: rahim.id,
      note: 'Bike repair dhar',
      verificationStatus: 'CONFIRMED',
      verifiedAt: new Date(Date.now() - 86400000),
      transactionDate: new Date(Date.now() - 86400000 * 2),
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      bookId: personalBook.id,
      type: 'INCOME',
      amountPaisa: tk(15000),
      currency: 'USD',
      originalAmountPaisa: tk(125),
      exchangeRate: 120.0,
      walletId: dbbl.id,
      categoryId: freelanceCat.id,
      note: 'Client logo project ($125 USD @ 120)',
      transactionDate: new Date(Date.now() - 86400000),
      tags: { create: [{ tagId: fiverrTag.id }] },
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      bookId: personalBook.id,
      type: 'EXPENSE',
      amountPaisa: tk(220),
      walletId: cash.id,
      categoryId: foodCat.id,
      note: 'Lunch with friends',
      tags: { create: [{ tagId: hangoutTag.id }] },
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      bookId: storeBook.id,
      type: 'CREDIT_EXPENSE',
      amountPaisa: tk(1500),
      contactId: karim.id,
      note: 'Shop accessory restock on baki',
      transactionDate: new Date(Date.now() - 86400000 * 3),
    },
  });

  const storeSaleTx = await prisma.transaction.create({
    data: {
      userId: user.id,
      bookId: storeBook.id,
      type: 'LEND',
      amountPaisa: tk(900),
      contactId: rahim.id,
      note: 'Store Invoice #INV-2026-0001 (2x Type-C 65W Fast Charger)',
      verificationStatus: 'PENDING',
    },
  });

  await prisma.stockOrder.create({
    data: {
      userId: user.id,
      bookId: storeBook.id,
      orderNumber: 'INV-2026-0001',
      type: 'SALE',
      contactId: rahim.id,
      subtotalPaisa: tk(900),
      totalAmountPaisa: tk(900),
      paidAmountPaisa: tk(0),
      dueAmountPaisa: tk(900),
      profitPaisa: tk(200),
      transactionId: storeSaleTx.id,
      items: {
        create: [
          {
            productId: charger.id,
            quantity: 2,
            mrpPricePaisa: tk(500),
            unitPricePaisa: tk(450),
            costPricePaisa: tk(350),
            priceVariancePaisa: tk(-100),
            lineTotalPaisa: tk(900),
          },
        ],
      },
      movements: {
        create: [
          {
            productId: charger.id,
            reason: 'SALE',
            quantityChange: -2,
            balanceAfter: 4,
            note: 'Invoice INV-2026-0001',
          },
        ],
      },
    },
  });

  const cashSaleTx = await prisma.transaction.create({
    data: {
      userId: user.id,
      bookId: storeBook.id,
      type: 'INCOME',
      amountPaisa: tk(2200),
      walletId: cashBox.id,
      note: 'Walk-in Cash Sale #INV-2026-0002',
    },
  });

  await prisma.stockOrder.create({
    data: {
      userId: user.id,
      bookId: storeBook.id,
      orderNumber: 'INV-2026-0002',
      type: 'SALE',
      subtotalPaisa: tk(2200),
      totalAmountPaisa: tk(2200),
      paidAmountPaisa: tk(2200),
      dueAmountPaisa: tk(0),
      profitPaisa: tk(700),
      transactionId: cashSaleTx.id,
      items: {
        create: [
          {
            productId: earbuds.id,
            quantity: 1,
            mrpPricePaisa: tk(1350),
            unitPricePaisa: tk(1400),
            costPricePaisa: tk(900),
            priceVariancePaisa: tk(50),
            lineTotalPaisa: tk(1400),
          },
          {
            productId: glass.id,
            quantity: 5,
            mrpPricePaisa: tk(150),
            unitPricePaisa: tk(160),
            costPricePaisa: tk(45),
            priceVariancePaisa: tk(50),
            lineTotalPaisa: tk(800),
          },
        ],
      },
    },
  });

  console.log('Seed complete! Demo login: demo@hisabpro.app / Demo@1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
