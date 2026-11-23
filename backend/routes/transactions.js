const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { computeLedgerDeltas, serialize, toPaisa } = require('../utils/money');

const router = express.Router();
router.use(requireAuth);

const createTxSchema = z.object({
  bookId: z.string().optional(),
  type: z.enum([
    'INCOME',
    'EXPENSE',
    'TRANSFER',
    'LEND',
    'BORROW',
    'CREDIT_EXPENSE',
    'SETTLEMENT_IN',
    'SETTLEMENT_OUT',
  ]),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  fee: z.coerce.number().min(0).default(0),
  currency: z.string().default('BDT'),
  originalAmount: z.coerce.number().positive().optional(),
  exchangeRate: z.coerce.number().positive().optional(),
  walletId: z.string().nullable().optional(),
  targetWalletId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  note: z.string().trim().max(300).optional(),
  transactionDate: z.string().optional(),
});

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const bookId = req.query.bookId;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const txWhere = { userId, deletedAt: null, transactionDate: { gte: monthStart } };
    if (bookId && bookId !== 'ALL') txWhere.bookId = bookId;

    const [wallets, contacts, monthTxs] = await Promise.all([
      req.prisma.wallet.findMany({ where: { userId, isArchived: false } }),
      req.prisma.contact.findMany({ where: { userId } }),
      req.prisma.transaction.findMany({ where: txWhere }),
    ]);

    const totalNetBalancePaisa = wallets.reduce((s, w) => s + w.balancePaisa, 0n);
    let totalPaboPaisa = 0n;
    let totalDeboPaisa = 0n;
    for (const c of contacts) {
      if (c.netBalancePaisa > 0n) totalPaboPaisa += c.netBalancePaisa;
      if (c.netBalancePaisa < 0n) totalDeboPaisa += -c.netBalancePaisa;
    }

    let monthIncomePaisa = 0n;
    let monthExpensePaisa = 0n;
    for (const tx of monthTxs) {
      if (tx.type === 'INCOME') monthIncomePaisa += tx.amountPaisa;
      if (tx.type === 'EXPENSE' || tx.type === 'CREDIT_EXPENSE') {
        monthExpensePaisa += tx.amountPaisa + tx.feePaisa;
      }
    }

    res.json(
      serialize({
        success: true,
        kpis: {
          totalNetBalancePaisa,
          totalPaboPaisa,
          totalDeboPaisa,
          safeToSpendPaisa: totalNetBalancePaisa - totalDeboPaisa,
          monthIncomePaisa,
          monthExpensePaisa,
        },
      })
    );
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { bookId, type, walletId, search } = req.query;

    const where = { userId, deletedAt: null };
    if (bookId && bookId !== 'ALL') where.bookId = bookId;
    if (type && type !== 'ALL') where.type = type;
    if (walletId && walletId !== 'ALL') {
      where.OR = [{ walletId }, { targetWalletId: walletId }];
    }
    if (search && String(search).trim()) {
      const q = String(search).trim();
      where.AND = [
        {
          OR: [
            { note: { contains: q, mode: 'insensitive' } },
            { contact: { name: { contains: q, mode: 'insensitive' } } },
            { category: { name: { contains: q, mode: 'insensitive' } } },
            { tags: { some: { tag: { name: { contains: q.replace(/^#/, ''), mode: 'insensitive' } } } } },
          ],
        },
      ];
    }

    const transactions = await req.prisma.transaction.findMany({
      where,
      include: {
        book: { select: { id: true, name: true, bookType: true } },
        wallet: { select: { id: true, name: true, type: true } },
        targetWallet: { select: { id: true, name: true, type: true } },
        contact: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
      orderBy: { transactionDate: 'desc' },
      take: 100,
    });

    res.json(serialize({ success: true, transactions }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = createTxSchema.parse(req.body);

    const resolvedWalletId = body.type === 'CREDIT_EXPENSE' ? null : body.walletId || null;
    const resolvedTargetId = body.type === 'TRANSFER' ? body.targetWalletId || null : null;

    if (body.type === 'TRANSFER') {
      if (!resolvedWalletId || !resolvedTargetId) {
        throw new AppError('TRANSFER requires both Source Wallet and Target Wallet.', 400);
      }
      if (resolvedWalletId === resolvedTargetId) {
        throw new AppError('Source and Target wallets must be different.', 400);
      }
    }

    const needsContact = ['LEND', 'BORROW', 'CREDIT_EXPENSE', 'SETTLEMENT_IN', 'SETTLEMENT_OUT'].includes(
      body.type
    );
    if (needsContact && !body.contactId) {
      throw new AppError(`${body.type} requires selecting a Contact.`, 400);
    }

    const bdtAmount =
      body.currency !== 'BDT' && body.originalAmount && body.exchangeRate
        ? body.originalAmount * body.exchangeRate
        : body.amount;

    const amountPaisa = toPaisa(bdtAmount);
    const feePaisa = toPaisa(body.fee);
    const deltas = computeLedgerDeltas({ type: body.type, amountPaisa, feePaisa });

    const transaction = await req.prisma.$transaction(async (tx) => {
      const book =
        (body.bookId && body.bookId !== 'ALL'
          ? await tx.ledgerBook.findFirst({ where: { id: body.bookId, userId } })
          : await tx.ledgerBook.findFirst({ where: { userId, isDefault: true } })) ??
        (await tx.ledgerBook.findFirst({ where: { userId } }));

      if (!book) throw new AppError('Ledger book not found.', 404);

      if (resolvedWalletId && deltas.sourceWalletDelta !== 0n) {
        const w = await tx.wallet.findFirst({ where: { id: resolvedWalletId, userId } });
        if (!w) throw new AppError('Source wallet not found.', 404);
        await tx.wallet.update({
          where: { id: w.id },
          data: { balancePaisa: { increment: deltas.sourceWalletDelta } },
        });
      }

      if (resolvedTargetId && deltas.targetWalletDelta !== 0n) {
        const tw = await tx.wallet.findFirst({ where: { id: resolvedTargetId, userId } });
        if (!tw) throw new AppError('Target wallet not found.', 404);
        await tx.wallet.update({
          where: { id: tw.id },
          data: { balancePaisa: { increment: deltas.targetWalletDelta } },
        });
      }

      if (body.contactId && deltas.contactNetDelta !== 0n) {
        const c = await tx.contact.findFirst({ where: { id: body.contactId, userId } });
        if (!c) throw new AppError('Contact not found.', 404);
        await tx.contact.update({
          where: { id: c.id },
          data: { netBalancePaisa: { increment: deltas.contactNetDelta } },
        });
      }

      const uniqueTags = [...new Set(body.tags.map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean))];
      const tagRecords = await Promise.all(
        uniqueTags.map((name) =>
          tx.tag.upsert({
            where: { userId_name: { userId, name } },
            create: { userId, name },
            update: {},
          })
        )
      );

      return tx.transaction.create({
        data: {
          userId,
          bookId: book.id,
          type: body.type,
          amountPaisa,
          feePaisa,
          currency: body.currency,
          originalAmountPaisa: body.originalAmount ? toPaisa(body.originalAmount) : null,
          exchangeRate: body.exchangeRate ?? null,
          walletId: resolvedWalletId,
          targetWalletId: resolvedTargetId,
          contactId: body.contactId || null,
          categoryId: body.categoryId || null,
          note: body.note || null,
          transactionDate: body.transactionDate ? new Date(body.transactionDate) : new Date(),
          tags: { create: tagRecords.map((t) => ({ tagId: t.id })) },
        },
        include: {
          book: true,
          wallet: true,
          targetWallet: true,
          contact: true,
          category: true,
          tags: { include: { tag: true } },
        },
      });
    });

    res.status(201).json(serialize({ success: true, transaction }));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;

    const reversed = await req.prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: { id: req.params.id, userId, deletedAt: null },
      });
      if (!existing) throw new AppError('Transaction not found or already reversed.', 404);

      const deltas = computeLedgerDeltas({
        type: existing.type,
        amountPaisa: existing.amountPaisa,
        feePaisa: existing.feePaisa,
      });

      if (existing.walletId && deltas.sourceWalletDelta !== 0n) {
        await tx.wallet.update({
          where: { id: existing.walletId },
          data: { balancePaisa: { increment: -deltas.sourceWalletDelta } },
        });
      }
      if (existing.targetWalletId && deltas.targetWalletDelta !== 0n) {
        await tx.wallet.update({
          where: { id: existing.targetWalletId },
          data: { balancePaisa: { increment: -deltas.targetWalletDelta } },
        });
      }
      if (existing.contactId && deltas.contactNetDelta !== 0n) {
        await tx.contact.update({
          where: { id: existing.contactId },
          data: { netBalancePaisa: { increment: -deltas.contactNetDelta } },
        });
      }

      return tx.transaction.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
    });

    res.json(serialize({ success: true, message: 'Reversed & soft-deleted cleanly.', transaction: reversed }));
  })
);

module.exports = router;
