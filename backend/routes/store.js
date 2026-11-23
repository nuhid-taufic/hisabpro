const express = require('express');
const { Prisma } = require('@prisma/client');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { serialize, toPaisa } = require('../utils/money');

const router = express.Router();
router.use(requireAuth);

const createProductSchema = z.object({
  bookId: z.string(),
  name: z.string().trim().min(1, 'Product name is required').max(100),
  sku: z.string().trim().max(40).optional().or(z.literal('')),
  unit: z.string().trim().default('pcs'),
  costPrice: z.coerce.number().min(0),
  mrpPrice: z.coerce.number().min(0),
  minSellPrice: z.coerce.number().min(0).optional(),
  openingStock: z.coerce.number().min(0).default(0),
  lowStockLimit: z.coerce.number().min(0).default(5),
});

const adjustStockSchema = z.object({
  reason: z.enum(['DAMAGE', 'RETURN_IN', 'RETURN_OUT', 'MANUAL_ADJUST']),
  quantityChange: z.coerce.number().refine((v) => v !== 0, 'Quantity change cannot be zero'),
  note: z.string().trim().max(200).optional(),
});

const orderItemSchema = z.object({
  productId: z.string(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

const createOrderSchema = z.object({
  bookId: z.string(),
  type: z.enum(['SALE', 'PURCHASE']),
  contactId: z.string().nullable().optional(),
  walletId: z.string().nullable().optional(),
  discount: z.coerce.number().min(0).default(0),
  paidAmount: z.coerce.number().min(0).default(0),
  note: z.string().trim().max(300).optional(),
  items: z.array(orderItemSchema).min(1, 'Add at least one product to the cart'),
});

const closeDaySchema = z.object({
  bookId: z.string(),
  walletId: z.string(),
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  actualCash: z.coerce.number().min(0),
  denominationJson: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
  autoReconcile: z.boolean().default(true),
  note: z.string().trim().max(250).optional(),
});

async function computeExpectedCash(prismaClient, { userId, bookId, walletId, dateStr }) {
  const wallet = await prismaClient.wallet.findFirst({ where: { id: walletId, userId } });
  if (!wallet) throw new AppError('Cash wallet not found.', 404);

  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const [todayTxs, prevClosing, existingClosing] = await Promise.all([
    prismaClient.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        transactionDate: { gte: dayStart, lte: dayEnd },
        OR: [{ walletId }, { targetWalletId: walletId }],
      },
    }),
    prismaClient.dailyCashClosing.findFirst({
      where: { userId, bookId, walletId, closingDate: { lt: dayStart } },
      orderBy: { closingDate: 'desc' },
    }),
    prismaClient.dailyCashClosing.findFirst({
      where: { userId, bookId, walletId, closingDate: dayStart },
    }),
  ]);

  let cashInTotalPaisa = 0n;
  let cashOutTotalPaisa = 0n;

  for (const t of todayTxs) {
    if (t.type === 'ADJUSTMENT') continue;
    if (t.targetWalletId === walletId && t.type === 'TRANSFER') {
      cashInTotalPaisa += t.amountPaisa;
    } else if (t.walletId === walletId) {
      if (['INCOME', 'BORROW', 'SETTLEMENT_IN'].includes(t.type)) {
        cashInTotalPaisa += t.amountPaisa - t.feePaisa;
      } else if (['EXPENSE', 'TRANSFER', 'LEND', 'SETTLEMENT_OUT'].includes(t.type)) {
        cashOutTotalPaisa += t.amountPaisa + t.feePaisa;
      }
    }
  }

  const openingCashPaisa = prevClosing
    ? prevClosing.actualCashPaisa
    : wallet.balancePaisa - cashInTotalPaisa + cashOutTotalPaisa;
  const expectedCashPaisa = openingCashPaisa + cashInTotalPaisa - cashOutTotalPaisa;

  return {
    wallet,
    dayStart,
    openingCashPaisa,
    cashInTotalPaisa,
    cashOutTotalPaisa,
    expectedCashPaisa,
    existingClosing,
  };
}

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const bookId = req.query.bookId;

    const where = { userId, isActive: true };
    if (bookId && bookId !== 'ALL') where.bookId = bookId;

    const products = await req.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    const enriched = products.map((p) => ({
      ...p,
      isLowStock: Number(p.currentStock) <= Number(p.lowStockLimit),
      stockValuePaisa: BigInt(Math.round(Number(p.currentStock) * Number(p.costPricePaisa))),
    }));

    res.json(serialize({ success: true, products: enriched }));
  })
);

router.post(
  '/products',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = createProductSchema.parse(req.body);

    const book = await req.prisma.ledgerBook.findFirst({ where: { id: body.bookId, userId } });
    if (!book) throw new AppError('Store book not found.', 404);

    const product = await req.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          userId,
          bookId: book.id,
          name: body.name,
          sku: body.sku || null,
          unit: body.unit,
          costPricePaisa: toPaisa(body.costPrice),
          mrpPricePaisa: toPaisa(body.mrpPrice),
          minSellPricePaisa: body.minSellPrice !== undefined ? toPaisa(body.minSellPrice) : null,
          currentStock: body.openingStock,
          lowStockLimit: body.lowStockLimit,
        },
      });

      if (body.openingStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            reason: 'MANUAL_ADJUST',
            quantityChange: body.openingStock,
            balanceAfter: body.openingStock,
            note: 'Opening stock',
          },
        });
      }

      return created;
    });

    res.status(201).json(serialize({ success: true, product }));
  })
);

router.get(
  '/products/:id/movements',
  asyncHandler(async (req, res) => {
    const product = await req.prisma.product.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
    });
    if (!product) throw new AppError('Product not found.', 404);

    const movements = await req.prisma.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(serialize({ success: true, product, movements }));
  })
);

router.post(
  '/products/:id/adjust',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = adjustStockSchema.parse(req.body);

    const result = await req.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: req.params.id, userId } });
      if (!product) throw new AppError('Product not found.', 404);

      const newStock = Number(product.currentStock) + body.quantityChange;
      if (newStock < 0) throw new AppError('Stock cannot drop below zero.', 400);

      const updated = await tx.product.update({
        where: { id: product.id },
        data: { currentStock: newStock },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          reason: body.reason,
          quantityChange: body.quantityChange,
          balanceAfter: newStock,
          note: body.note || `${body.reason} adjustment`,
        },
      });

      return { product: updated, movement };
    });

    res.json(serialize({ success: true, ...result }));
  })
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const bookId = req.query.bookId;

    const where = { userId, deletedAt: null };
    if (bookId && bookId !== 'ALL') where.bookId = bookId;

    const orders = await req.prisma.stockOrder.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
      },
      orderBy: { orderDate: 'desc' },
      take: 50,
    });

    res.json(serialize({ success: true, orders }));
  })
);

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = createOrderSchema.parse(req.body);

    const result = await req.prisma.$transaction(async (tx) => {
      const book = await tx.ledgerBook.findFirst({ where: { id: body.bookId, userId } });
      if (!book) throw new AppError('Store book not found.', 404);

      const productIds = body.items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, userId, bookId: book.id },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      let subtotalPaisa = 0n;
      let totalProfitPaisa = 0n;
      const lossWarnings = [];
      const preparedItems = [];

      for (const item of body.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError('One of the products was not found in this store book.', 404);

        if (body.type === 'SALE' && Number(product.currentStock) < item.quantity) {
          throw new AppError(
            `Not enough stock for ${product.name} (Available: ${product.currentStock} ${product.unit}).`,
            400
          );
        }

        const unitPricePaisa = toPaisa(item.unitPrice);
        const lineTotalPaisa = BigInt(Math.round(item.quantity * Number(unitPricePaisa)));
        const priceVariancePaisa = BigInt(
          Math.round(item.quantity * (Number(unitPricePaisa) - Number(product.mrpPricePaisa)))
        );

        subtotalPaisa += lineTotalPaisa;

        if (body.type === 'SALE') {
          const itemProfit = BigInt(
            Math.round(item.quantity * (Number(unitPricePaisa) - Number(product.costPricePaisa)))
          );
          totalProfitPaisa += itemProfit;

          if (unitPricePaisa < product.costPricePaisa) {
            lossWarnings.push({
              productName: product.name,
              unitPrice: item.unitPrice,
              costPrice: Number(product.costPricePaisa) / 100,
            });
          }
        }

        preparedItems.push({
          product,
          qty: item.quantity,
          unitPricePaisa,
          mrpPricePaisa: product.mrpPricePaisa,
          costPricePaisa: product.costPricePaisa,
          priceVariancePaisa,
          lineTotalPaisa,
        });
      }

      const discountPaisa = toPaisa(body.discount);
      const totalAmountPaisa = subtotalPaisa - discountPaisa;
      if (totalAmountPaisa < 0n) throw new AppError('Discount cannot exceed subtotal.', 400);

      if (body.type === 'SALE') totalProfitPaisa -= discountPaisa;

      const paidAmountPaisa = toPaisa(body.paidAmount);
      const dueAmountPaisa = totalAmountPaisa - paidAmountPaisa;

      if (dueAmountPaisa < 0n) throw new AppError('Paid amount cannot exceed net bill total.', 400);
      if (dueAmountPaisa > 0n && !body.contactId) {
        throw new AppError('Please select a Customer or Supplier to record Baki (Due).', 400);
      }
      if (paidAmountPaisa > 0n && !body.walletId) {
        throw new AppError('Please select a Wallet (e.g., Shop Cash Box) for the paid portion.', 400);
      }

      const orderCount = await tx.stockOrder.count({ where: { bookId: book.id } });
      const prefix = body.type === 'SALE' ? 'INV' : 'PUR';
      const orderNumber = `${prefix}-${new Date().getFullYear()}-${String(orderCount + 1).padStart(4, '0')}`;

      for (const line of preparedItems) {
        const oldStock = Number(line.product.currentStock);
        const newStock = body.type === 'SALE' ? oldStock - line.qty : oldStock + line.qty;

        let newCostPaisa = line.product.costPricePaisa;
        if (body.type === 'PURCHASE' && newStock > 0) {
          const existingVal = oldStock * Number(line.product.costPricePaisa);
          const incomingVal = line.qty * Number(line.unitPricePaisa);
          newCostPaisa = BigInt(Math.round((existingVal + incomingVal) / newStock));
        }

        await tx.product.update({
          where: { id: line.product.id },
          data: { currentStock: newStock, costPricePaisa: newCostPaisa },
        });
      }

      const itemSummary = preparedItems.map((i) => `${i.qty}x ${i.product.name}`).join(', ');
      let primaryTxId = null;

      if (paidAmountPaisa > 0n && body.walletId) {
        const w = await tx.wallet.findFirst({ where: { id: body.walletId, userId } });
        if (!w) throw new AppError('Selected wallet not found.', 404);

        await tx.wallet.update({
          where: { id: w.id },
          data: { balancePaisa: { increment: body.type === 'SALE' ? paidAmountPaisa : -paidAmountPaisa } },
        });

        const cashTx = await tx.transaction.create({
          data: {
            userId,
            bookId: book.id,
            type: body.type === 'SALE' ? 'INCOME' : 'EXPENSE',
            amountPaisa: paidAmountPaisa,
            walletId: w.id,
            contactId: dueAmountPaisa === 0n ? body.contactId || null : null,
            note: `${body.type === 'SALE' ? 'Store Sale' : 'Stock Purchase'} #${orderNumber} (${itemSummary})${
              dueAmountPaisa > 0n ? ' [Paid Part]' : ''
            }`,
          },
        });
        primaryTxId = cashTx.id;
      }

      if (dueAmountPaisa > 0n && body.contactId) {
        const c = await tx.contact.findFirst({ where: { id: body.contactId, userId } });
        if (!c) throw new AppError('Selected contact not found.', 404);

        await tx.contact.update({
          where: { id: c.id },
          data: { netBalancePaisa: { increment: body.type === 'SALE' ? dueAmountPaisa : -dueAmountPaisa } },
        });

        const dueTx = await tx.transaction.create({
          data: {
            userId,
            bookId: book.id,
            type: body.type === 'SALE' ? 'LEND' : 'CREDIT_EXPENSE',
            amountPaisa: dueAmountPaisa,
            walletId: null,
            contactId: c.id,
            note: `${body.type === 'SALE' ? 'Store Invoice' : 'Purchase Baki'} #${orderNumber} (${itemSummary})`,
          },
        });
        primaryTxId = dueTx.id;
      }

      const order = await tx.stockOrder.create({
        data: {
          userId,
          bookId: book.id,
          orderNumber,
          type: body.type,
          contactId: body.contactId || null,
          subtotalPaisa,
          discountPaisa,
          totalAmountPaisa,
          paidAmountPaisa,
          dueAmountPaisa,
          profitPaisa: body.type === 'SALE' ? totalProfitPaisa : 0n,
          transactionId: primaryTxId,
          note: body.note || null,
          items: {
            create: preparedItems.map((line) => ({
              productId: line.product.id,
              quantity: line.qty,
              mrpPricePaisa: line.mrpPricePaisa,
              unitPricePaisa: line.unitPricePaisa,
              costPricePaisa: line.costPricePaisa,
              priceVariancePaisa: line.priceVariancePaisa,
              lineTotalPaisa: line.lineTotalPaisa,
            })),
          },
          movements: {
            create: preparedItems.map((line) => {
              const oldStock = Number(line.product.currentStock);
              const qtyChange = body.type === 'SALE' ? -line.qty : line.qty;
              return {
                productId: line.product.id,
                reason: body.type === 'SALE' ? 'SALE' : 'PURCHASE',
                quantityChange: qtyChange,
                balanceAfter: oldStock + qtyChange,
                note: `Order #${orderNumber}`,
              };
            }),
          },
        },
        include: {
          contact: true,
          items: { include: { product: true } },
        },
      });

      return { order, lossWarnings };
    });

    res.status(201).json(serialize({ success: true, ...result }));
  })
);

router.get(
  '/analytics/trending',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const bookId = req.query.bookId;
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const productWhere = { userId, isActive: true };
    if (bookId && bookId !== 'ALL') productWhere.bookId = bookId;

    const products = await req.prisma.product.findMany({ where: productWhere });
    const saleItems = await req.prisma.stockOrderItem.findMany({
      where: {
        order: {
          userId,
          ...(bookId && bookId !== 'ALL' ? { bookId } : {}),
          type: 'SALE',
          deletedAt: null,
          orderDate: { gte: since },
        },
      },
    });

    const statsMap = new Map();
    for (const p of products) {
      statsMap.set(p.id, {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        currentStock: Number(p.currentStock),
        lowStockLimit: Number(p.lowStockLimit),
        costPricePaisa: p.costPricePaisa,
        mrpPricePaisa: p.mrpPricePaisa,
        qtySold: 0,
        revenuePaisa: 0n,
        profitPaisa: 0n,
        mrpVariancePaisa: 0n,
      });
    }

    for (const item of saleItems) {
      const entry = statsMap.get(item.productId);
      if (!entry) continue;
      const qty = Number(item.quantity);
      entry.qtySold += qty;
      entry.revenuePaisa += item.lineTotalPaisa;
      entry.profitPaisa += BigInt(
        Math.round(qty * (Number(item.unitPricePaisa) - Number(item.costPricePaisa)))
      );
      entry.mrpVariancePaisa += item.priceVariancePaisa;
    }

    const all = [...statsMap.values()];
    res.json(
      serialize({
        success: true,
        periodDays: days,
        topSelling: [...all].filter((s) => s.qtySold > 0).sort((a, b) => b.qtySold - a.qtySold).slice(0, 10),
        mostProfitable: [...all]
          .filter((s) => s.profitPaisa > 0n)
          .sort((a, b) => Number(b.profitPaisa - a.profitPaisa))
          .slice(0, 10),
        lowStockRadar: all
          .filter((s) => s.currentStock <= s.lowStockLimit)
          .sort((a, b) => b.qtySold - a.qtySold),
        deadStock: all.filter((s) => s.qtySold === 0 && s.currentStock > 0),
      })
    );
  })
);

router.get(
  '/cash-closing/expected',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { bookId, walletId } = req.query;
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);

    if (!bookId || !walletId) {
      throw new AppError('bookId and walletId are required.', 400);
    }

    const data = await computeExpectedCash(req.prisma, { userId, bookId, walletId, dateStr });
    const history = await req.prisma.dailyCashClosing.findMany({
      where: { userId, bookId, walletId },
      orderBy: { closingDate: 'desc' },
      take: 10,
    });

    res.json(
      serialize({
        success: true,
        date: dateStr,
        wallet: { id: data.wallet.id, name: data.wallet.name, liveBalancePaisa: data.wallet.balancePaisa },
        openingCashPaisa: data.openingCashPaisa,
        cashInTotalPaisa: data.cashInTotalPaisa,
        cashOutTotalPaisa: data.cashOutTotalPaisa,
        expectedCashPaisa: data.expectedCashPaisa,
        alreadyClosed: data.existingClosing,
        history,
      })
    );
  })
);

router.post(
  '/cash-closing',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = closeDaySchema.parse(req.body);
    const actualCashPaisa = toPaisa(body.actualCash);

    const closing = await req.prisma.$transaction(async (tx) => {
      const calc = await computeExpectedCash(tx, {
        userId,
        bookId: body.bookId,
        walletId: body.walletId,
        dateStr: body.closingDate,
      });

      const discrepancyPaisa = actualCashPaisa - calc.expectedCashPaisa;
      let adjustmentTxId = calc.existingClosing?.adjustmentTxId || null;

      if (body.autoReconcile && discrepancyPaisa !== 0n) {
        const adj = await tx.transaction.create({
          data: {
            userId,
            bookId: body.bookId,
            type: 'ADJUSTMENT',
            amountPaisa: discrepancyPaisa,
            walletId: calc.wallet.id,
            note:
              body.note ||
              `Daily Cash Closing (${body.closingDate}): ${
                discrepancyPaisa < 0n ? 'Cash Shortage (Ghatti)' : 'Cash Surplus (Barti)'
              }`,
          },
        });
        adjustmentTxId = adj.id;

        await tx.wallet.update({
          where: { id: calc.wallet.id },
          data: { balancePaisa: actualCashPaisa },
        });
      }

      return tx.dailyCashClosing.upsert({
        where: {
          bookId_walletId_closingDate: {
            bookId: body.bookId,
            walletId: calc.wallet.id,
            closingDate: calc.dayStart,
          },
        },
        create: {
          userId,
          bookId: body.bookId,
          walletId: calc.wallet.id,
          closingDate: calc.dayStart,
          openingCashPaisa: calc.openingCashPaisa,
          cashInTotalPaisa: calc.cashInTotalPaisa,
          cashOutTotalPaisa: calc.cashOutTotalPaisa,
          expectedCashPaisa: calc.expectedCashPaisa,
          actualCashPaisa,
          discrepancyPaisa,
          denominationJson: body.denominationJson ?? Prisma.JsonNull,
          adjustmentTxId,
          note: body.note || null,
        },
        update: {
          openingCashPaisa: calc.openingCashPaisa,
          cashInTotalPaisa: calc.cashInTotalPaisa,
          cashOutTotalPaisa: calc.cashOutTotalPaisa,
          expectedCashPaisa: calc.expectedCashPaisa,
          actualCashPaisa,
          discrepancyPaisa,
          denominationJson: body.denominationJson ?? Prisma.JsonNull,
          adjustmentTxId,
          note: body.note || null,
        },
      });
    });

    res.status(201).json(serialize({ success: true, closing }));
  })
);

module.exports = router;
