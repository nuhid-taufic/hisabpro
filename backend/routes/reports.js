const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { serialize } = require('../utils/money');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const bookId = req.query.bookId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const txWhere = { userId, deletedAt: null, transactionDate: { gte: monthStart } };
    if (bookId && bookId !== 'ALL') txWhere.bookId = bookId;

    const orderWhere = { userId, type: 'SALE', deletedAt: null, orderDate: { gte: monthStart } };
    if (bookId && bookId !== 'ALL') orderWhere.bookId = bookId;

    const [wallets, contacts, monthlyTxs, monthlyOrders] = await Promise.all([
      req.prisma.wallet.findMany({ where: { userId, isArchived: false } }),
      req.prisma.contact.findMany({ where: { userId } }),
      req.prisma.transaction.findMany({
        where: txWhere,
        include: { category: true, tags: { include: { tag: true } } },
      }),
      req.prisma.stockOrder.findMany({ where: orderWhere }),
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
    const categoryTotals = new Map();
    const tagTotals = new Map();

    for (const tx of monthlyTxs) {
      if (tx.type === 'INCOME') {
        monthIncomePaisa += tx.amountPaisa;
      } else if (tx.type === 'EXPENSE' || tx.type === 'CREDIT_EXPENSE') {
        monthExpensePaisa += tx.amountPaisa + tx.feePaisa;
        const catName = tx.category?.name || 'Uncategorized';
        categoryTotals.set(catName, (categoryTotals.get(catName) ?? 0n) + tx.amountPaisa);
      }
      for (const tt of tx.tags) {
        tagTotals.set(tt.tag.name, (tagTotals.get(tt.tag.name) ?? 0n) + tx.amountPaisa);
      }
    }

    const monthStoreSalesPaisa = monthlyOrders.reduce((s, o) => s + o.totalAmountPaisa, 0n);
    const monthStoreProfitPaisa = monthlyOrders.reduce((s, o) => s + o.profitPaisa, 0n);

    res.json(
      serialize({
        success: true,
        monthLabel: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        kpis: {
          totalNetBalancePaisa,
          totalPaboPaisa,
          totalDeboPaisa,
          safeToSpendPaisa: totalNetBalancePaisa - totalDeboPaisa,
          monthIncomePaisa,
          monthExpensePaisa,
          monthNetCashflowPaisa: monthIncomePaisa - monthExpensePaisa,
          monthStoreSalesPaisa,
          monthStoreProfitPaisa,
          monthOrderCount: monthlyOrders.length,
        },
        categoryBreakdown: [...categoryTotals.entries()]
          .map(([name, amountPaisa]) => ({ name, amountPaisa }))
          .sort((a, b) => Number(b.amountPaisa - a.amountPaisa)),
        tagBreakdown: [...tagTotals.entries()]
          .map(([name, amountPaisa]) => ({ name, amountPaisa }))
          .sort((a, b) => Number(b.amountPaisa - a.amountPaisa)),
      })
    );
  })
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const format = req.query.format || 'csv';
    const bookId = req.query.bookId;
    const today = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const [books, wallets, contacts, products, transactions, stockOrders, closings] =
        await Promise.all([
          req.prisma.ledgerBook.findMany({ where: { userId } }),
          req.prisma.wallet.findMany({ where: { userId } }),
          req.prisma.contact.findMany({ where: { userId } }),
          req.prisma.product.findMany({ where: { userId } }),
          req.prisma.transaction.findMany({ where: { userId }, orderBy: { transactionDate: 'desc' } }),
          req.prisma.stockOrder.findMany({ where: { userId }, include: { items: true } }),
          req.prisma.dailyCashClosing.findMany({ where: { userId } }),
        ]);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="hisabpro-backup-${today}.json"`);
      return res.send(
        JSON.stringify(
          serialize({
            exportedAt: new Date().toISOString(),
            books,
            wallets,
            contacts,
            products,
            transactions,
            stockOrders,
            closings,
          }),
          null,
          2
        )
      );
    }

    const where = { userId, deletedAt: null };
    if (bookId && bookId !== 'ALL') where.bookId = bookId;

    const txs = await req.prisma.transaction.findMany({
      where,
      include: { wallet: true, contact: true, category: true, book: true },
      orderBy: { transactionDate: 'desc' },
    });

    const esc = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = ['Date', 'Book', 'Type', 'Amount (BDT)', 'Fee (BDT)', 'Wallet', 'Contact', 'Category', 'TrxID', 'Note'];
    const rows = txs.map((t) =>
      [
        t.transactionDate.toISOString().slice(0, 10),
        t.book.name,
        t.type,
        (Number(t.amountPaisa) / 100).toFixed(2),
        (Number(t.feePaisa) / 100).toFixed(2),
        t.wallet?.name || '',
        t.contact?.name || '',
        t.category?.name || '',
        t.externalTrxId || '',
        t.note || '',
      ]
        .map(esc)
        .join(',')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hisabpro-statement-${today}.csv"`);
    return res.send([headers.join(','), ...rows].join('\n'));
  })
);

module.exports = router;
