const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { serialize, toPaisa } = require('../utils/money');

const router = express.Router();
router.use(requireAuth);

const createWalletSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(['CASH', 'MFS', 'BANK', 'CARD']).default('CASH'),
  openingBalance: z.coerce.number().default(0),
});

const reconcileSchema = z.object({
  actualBalance: z.coerce.number(),
  bookId: z.string().optional(),
  note: z.string().trim().max(200).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const wallets = await req.prisma.wallet.findMany({
      where: { userId: req.user.userId, isArchived: false },
      orderBy: { createdAt: 'asc' },
    });
    res.json(serialize({ success: true, wallets }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createWalletSchema.parse(req.body);
    const openingPaisa = toPaisa(body.openingBalance);
    const wallet = await req.prisma.wallet.create({
      data: {
        userId: req.user.userId,
        name: body.name,
        type: body.type,
        openingBalancePaisa: openingPaisa,
        balancePaisa: openingPaisa,
      },
    });
    res.status(201).json(serialize({ success: true, wallet }));
  })
);

router.post(
  '/:id/reconcile',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = reconcileSchema.parse(req.body);
    const actualPaisa = toPaisa(body.actualBalance);

    const result = await req.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({ where: { id: req.params.id, userId } });
      if (!wallet) throw new AppError('Wallet not found.', 404);

      const deltaPaisa = actualPaisa - wallet.balancePaisa;
      if (deltaPaisa === 0n) return { wallet, deltaPaisa: 0n };

      const book =
        (body.bookId && body.bookId !== 'ALL'
          ? await tx.ledgerBook.findFirst({ where: { id: body.bookId, userId } })
          : await tx.ledgerBook.findFirst({ where: { userId, isDefault: true } })) ??
        (await tx.ledgerBook.findFirst({ where: { userId } }));

      if (!book) throw new AppError('No ledger book available.', 400);

      await tx.transaction.create({
        data: {
          userId,
          bookId: book.id,
          type: 'ADJUSTMENT',
          amountPaisa: deltaPaisa,
          walletId: wallet.id,
          note:
            body.note ||
            `Hisab Milano (${deltaPaisa > 0n ? 'Surplus +' : 'Shortage '}${(Number(deltaPaisa) / 100).toFixed(2)} Tk)`,
        },
      });

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balancePaisa: actualPaisa },
      });

      return { wallet: updated, deltaPaisa };
    });

    res.json(serialize({ success: true, ...result }));
  })
);

module.exports = router;
