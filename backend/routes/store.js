const express = require('express');
const router = express.Router();

router.get('/products', async (req, res) => {
  const products = await req.prisma.product.findMany({ orderBy: { name: 'asc' } });
  const enriched = products.map((p) => ({
    ...p,
    isLowStock: p.currentStock <= p.lowStockLimit,
  }));
  res.json(enriched);
});

router.post('/products', async (req, res) => {
  try {
    const {
      name,
      sku,
      unit = 'pcs',
      costPrice,
      mrpPrice,
      openingStock = 0,
      lowStockLimit = 5,
    } = req.body;

    const product = await req.prisma.product.create({
      data: {
        name,
        sku: sku || null,
        unit,
        costPricePaisa: Math.round(Number(costPrice) * 100),
        mrpPricePaisa: Math.round(Number(mrpPrice) * 100),
        currentStock: Number(openingStock),
        lowStockLimit: Number(lowStockLimit),
      },
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/orders', async (req, res) => {
  const orders = await req.prisma.stockOrder.findMany({
    include: { contact: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json(orders);
});

router.post('/orders', async (req, res) => {
  try {
    const { type = 'SALE', contactId, walletId, paidAmount, note, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Kompokkhe 1-ta product din' });
    }

    const result = await req.prisma.$transaction(async (tx) => {
      let totalAmountPaisa = 0;
      let totalProfitPaisa = 0;
      const lossWarnings = [];
      const preparedItems = [];

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error('Product pawa jayni');

        const qty = Number(item.quantity);
        if (type === 'SALE' && product.currentStock < qty) {
          throw new Error(`${product.name} er stock kom ache (Ache: ${product.currentStock})`);
        }

        const unitPricePaisa = Math.round(Number(item.unitPrice) * 100);
        const lineTotalPaisa = Math.round(qty * unitPricePaisa);
        const priceVariancePaisa = Math.round(qty * (unitPricePaisa - product.mrpPricePaisa));

        totalAmountPaisa += lineTotalPaisa;

        if (type === 'SALE') {
          totalProfitPaisa += Math.round(qty * (unitPricePaisa - product.costPricePaisa));
          if (unitPricePaisa < product.costPricePaisa) {
            lossWarnings.push({
              product: product.name,
              soldAtTaka: unitPricePaisa / 100,
              costTaka: product.costPricePaisa / 100,
            });
          }
        }

        preparedItems.push({
          product,
          qty,
          unitPricePaisa,
          mrpPricePaisa: product.mrpPricePaisa,
          costPricePaisa: product.costPricePaisa,
          priceVariancePaisa,
          lineTotalPaisa,
        });
      }

      const paidPaisa =
        paidAmount === undefined || paidAmount === null
          ? totalAmountPaisa
          : Math.round(Number(paidAmount) * 100);
      const duePaisa = totalAmountPaisa - paidPaisa;

      if (duePaisa < 0) throw new Error('Paid amount total bill er cheye beshi hote parbe na');
      if (duePaisa > 0 && !contactId) {
        throw new Error('Baki rakhle Customer ba Supplier select korte hobe');
      }

      for (const line of preparedItems) {
        const newStock =
          type === 'SALE' ? line.product.currentStock - line.qty : line.product.currentStock + line.qty;

        let newCostPaisa = line.product.costPricePaisa;
        if (type === 'PURCHASE' && newStock > 0) {
          const oldVal = line.product.currentStock * line.product.costPricePaisa;
          const newVal = line.qty * line.unitPricePaisa;
          newCostPaisa = Math.round((oldVal + newVal) / newStock);
        }

        await tx.product.update({
          where: { id: line.product.id },
          data: { currentStock: newStock, costPricePaisa: newCostPaisa },
        });
      }

      if (paidPaisa > 0 && walletId) {
        await tx.wallet.update({
          where: { id: walletId },
          data: { balancePaisa: { increment: type === 'SALE' ? paidPaisa : -paidPaisa } },
        });
      }

      if (duePaisa > 0 && contactId) {
        await tx.contact.update({
          where: { id: contactId },
          data: { netBalancePaisa: { increment: type === 'SALE' ? duePaisa : -duePaisa } },
        });
      }

      const count = await tx.stockOrder.count();
      const orderNumber = `${type === 'SALE' ? 'INV' : 'PUR'}-${String(count + 1).padStart(4, '0')}`;
      const summaryText = preparedItems.map((i) => `${i.qty}x ${i.product.name}`).join(', ');

      await tx.transaction.create({
        data: {
          type:
            type === 'SALE'
              ? duePaisa > 0
                ? 'LEND'
                : 'INCOME'
              : duePaisa > 0
                ? 'BORROW'
                : 'EXPENSE',
          amountPaisa: duePaisa > 0 ? duePaisa : paidPaisa,
          walletId: paidPaisa > 0 ? walletId || null : null,
          contactId: contactId || null,
          note: `${type === 'SALE' ? 'Store Sale' : 'Purchase'} #${orderNumber} (${summaryText})`,
        },
      });

      const order = await tx.stockOrder.create({
        data: {
          orderNumber,
          type,
          contactId: contactId || null,
          totalAmountPaisa,
          paidAmountPaisa: paidPaisa,
          dueAmountPaisa: duePaisa,
          profitPaisa: type === 'SALE' ? totalProfitPaisa : 0,
          note: note || null,
          items: {
            create: preparedItems.map((i) => ({
              productId: i.product.id,
              quantity: i.qty,
              mrpPricePaisa: i.mrpPricePaisa,
              unitPricePaisa: i.unitPricePaisa,
              costPricePaisa: i.costPricePaisa,
              priceVariancePaisa: i.priceVariancePaisa,
              lineTotalPaisa: i.lineTotalPaisa,
            })),
          },
        },
        include: { contact: true, items: { include: { product: true } } },
      });

      return { order, lossWarnings };
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/trending', async (req, res) => {
  const products = await req.prisma.product.findMany();
  const saleItems = await req.prisma.stockOrderItem.findMany({
    where: { order: { type: 'SALE' } },
  });

  const stats = new Map();
  for (const p of products) {
    stats.set(p.id, {
      productId: p.id,
      name: p.name,
      currentStock: p.currentStock,
      lowStockLimit: p.lowStockLimit,
      qtySold: 0,
      revenueTaka: 0,
      profitTaka: 0,
    });
  }

  for (const item of saleItems) {
    const s = stats.get(item.productId);
    if (!s) continue;
    s.qtySold += item.quantity;
    s.revenueTaka += item.lineTotalPaisa / 100;
    s.profitTaka += Math.round(item.quantity * (item.unitPricePaisa - item.costPricePaisa)) / 100;
  }

  const list = [...stats.values()];
  res.json({
    topSelling: [...list].filter((x) => x.qtySold > 0).sort((a, b) => b.qtySold - a.qtySold),
    mostProfitable: [...list].filter((x) => x.profitTaka > 0).sort((a, b) => b.profitTaka - a.profitTaka),
    lowStockRadar: list.filter((x) => x.currentStock <= x.lowStockLimit),
    deadStock: list.filter((x) => x.qtySold === 0 && x.currentStock > 0),
  });
});

router.get('/cash-closing/expected', async (req, res) => {
  const walletId = req.query.walletId;
  if (!walletId) return res.status(400).json({ error: 'walletId lagbe' });

  const wallet = await req.prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return res.status(404).json({ error: 'Wallet pawa jayni' });

  res.json({
    walletId: wallet.id,
    walletName: wallet.name,
    expectedCashTaka: wallet.balancePaisa / 100,
  });
});

router.post('/cash-closing', async (req, res) => {
  try {
    const { walletId, closingDate, actualCash, notesBreakdown } = req.body;
    const wallet = await req.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet pawa jayni' });

    const expectedCashPaisa = wallet.balancePaisa;
    const actualCashPaisa = Math.round(Number(actualCash) * 100);
    const discrepancyPaisa = actualCashPaisa - expectedCashPaisa;

    const closing = await req.prisma.$transaction(async (tx) => {
      if (discrepancyPaisa !== 0) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balancePaisa: actualCashPaisa },
        });
        await tx.transaction.create({
          data: {
            type: 'ADJUSTMENT',
            amountPaisa: discrepancyPaisa,
            walletId: wallet.id,
            note: `Day Close (${closingDate}): ${discrepancyPaisa < 0 ? 'Ghatti' : 'Barti'} ${discrepancyPaisa / 100} Tk`,
          },
        });
      }

      return tx.dailyCashClosing.upsert({
        where: { walletId_closingDate: { walletId: wallet.id, closingDate } },
        create: {
          walletId: wallet.id,
          closingDate,
          expectedCashPaisa,
          actualCashPaisa,
          discrepancyPaisa,
          notesBreakdown: notesBreakdown || null,
        },
        update: {
          expectedCashPaisa,
          actualCashPaisa,
          discrepancyPaisa,
          notesBreakdown: notesBreakdown || null,
        },
      });
    });

    res.status(201).json({
      closing,
      status:
        discrepancyPaisa === 0
          ? 'Exact Match'
          : discrepancyPaisa < 0
            ? `Cash Shortage (Ghatti): ${discrepancyPaisa / 100} Tk`
            : `Cash Surplus (Barti): +${discrepancyPaisa / 100} Tk`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
