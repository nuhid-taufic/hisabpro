const express = require('express');
const router = express.Router();

// Sob wallet dekha
router.get('/', async (req, res) => {
  const wallets = await req.prisma.wallet.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(wallets);
});

// Notun wallet banano (e.g. Cash, bKash, DBBL)
router.post('/', async (req, res) => {
  try {
    const { name, type = 'CASH', openingBalance = 0 } = req.body;
    const balancePaisa = Math.round(Number(openingBalance) * 100);
    const wallet = await req.prisma.wallet.create({
      data: { name, type, balancePaisa },
    });
    res.status(201).json(wallet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 1-Click Balance Reconcile ("Hisab Milano")
router.post('/:id/reconcile', async (req, res) => {
  try {
    const actualPaisa = Math.round(Number(req.body.actualBalance) * 100);
    const wallet = await req.prisma.wallet.findUnique({ where: { id: req.params.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet pawa jayni' });

    const deltaPaisa = actualPaisa - wallet.balancePaisa;
    const [updatedWallet] = await req.prisma.$transaction([
      req.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balancePaisa: actualPaisa },
      }),
      req.prisma.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amountPaisa: deltaPaisa,
          walletId: wallet.id,
          note: `Hisab Milano adjustment (${deltaPaisa >= 0 ? '+' : ''}${deltaPaisa / 100} Tk)`,
        },
      }),
    ]);

    res.json({ wallet: updatedWallet, adjustedByTaka: deltaPaisa / 100 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
