const express = require('express');
const router = express.Router();

// Sob transaction dekha
router.get('/', async (req, res) => {
  const txs = await req.prisma.transaction.findMany({
    include: { wallet: true, contact: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(txs);
});

// Atomic Transaction Save (INCOME, EXPENSE, LEND, BORROW, SETTLEMENT_IN, SETTLEMENT_OUT)
router.post('/', async (req, res) => {
  try {
    const { type, amount, fee = 0, note, walletId, contactId } = req.body;
    const amountPaisa = Math.round(Number(amount) * 100);
    const feePaisa = Math.round(Number(fee) * 100);

    let walletDelta = 0;
    let contactDelta = 0;

    if (type === 'INCOME') walletDelta = amountPaisa - feePaisa;
    else if (type === 'EXPENSE') walletDelta = -(amountPaisa + feePaisa);
    else if (type === 'LEND') {
      walletDelta = -(amountPaisa + feePaisa);
      contactDelta = amountPaisa; // Pabo barbe
    } else if (type === 'BORROW') {
      walletDelta = amountPaisa - feePaisa;
      contactDelta = -amountPaisa; // Debo barbe
    } else if (type === 'SETTLEMENT_IN') {
      walletDelta = amountPaisa - feePaisa;
      contactDelta = -amountPaisa; // Pabo kombe
    } else if (type === 'SETTLEMENT_OUT') {
      walletDelta = -(amountPaisa + feePaisa);
      contactDelta = amountPaisa; // Debo kombe
    }

    const createdTx = await req.prisma.$transaction(async (tx) => {
      if (walletId && walletDelta !== 0) {
        await tx.wallet.update({
          where: { id: walletId },
          data: { balancePaisa: { increment: walletDelta } },
        });
      }
      if (contactId && contactDelta !== 0) {
        await tx.contact.update({
          where: { id: contactId },
          data: { netBalancePaisa: { increment: contactDelta } },
        });
      }
      return tx.transaction.create({
        data: { type, amountPaisa, feePaisa, note, walletId: walletId || null, contactId: contactId || null },
        include: { wallet: true, contact: true },
      });
    });

    res.status(201).json(createdTx);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Flagship Magic Command & bKash/Nagad SMS Auto-Parser
router.post('/magic-preview', (req, res) => {
  const text = (req.body.input || '').trim();
  const lower = text.toLowerCase();

  // Check if it looks like a bKash / Nagad SMS
  const isSms = /(?:tk|bdt)\s*[\d,]+/i.test(text) && /(trxid|txnid|balance|fee|cash out|received)/i.test(text);

  if (isSms) {
    const amtMatch = text.match(/(?:tk|bdt)\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const feeMatch = text.match(/(?:fee|charge)\s*(?:tk|bdt)?\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const balMatch = text.match(/(?:balance|bal)\s*(?:tk|bdt)?\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const trxMatch = text.match(/(?:trxid|txnid)[:\s#-]*([A-Z0-9]{6,20})/i);

    const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0;
    const fee = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, '')) : 0;
    const smsBalance = balMatch ? parseFloat(balMatch[1].replace(/,/g, '')) : null;
    const type = lower.includes('received') || lower.includes('cash in') ? 'INCOME' : 'EXPENSE';

    return res.json({
      source: 'BD_SMS',
      type,
      amount,
      fee,
      walletHint: lower.includes('nagad') ? 'Nagad' : 'bKash',
      trxId: trxMatch ? trxMatch[1] : null,
      smsBalance,
      note: text,
    });
  }

  // Otherwise parse Banglish one-liner (e.g. "rahim ke 500 dhar dilam bkash")
  const amtMatch = text.match(/\b([\d,]+(?:\.\d{1,2})?)\b/);
  const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0;
  const contactMatch = text.match(/^([A-Za-z .]+?)\s+(?:ke|theke)\b/i);

  let type = 'EXPENSE';
  if (/dhar\s+dilam|pabo|baki\s+dilam/i.test(lower)) type = 'LEND';
  else if (/dhar\s+nilam|debo/i.test(lower)) type = 'BORROW';
  else if (/adoy|ferot\s+pelam/i.test(lower)) type = 'SETTLEMENT_IN';
  else if (/pelam|income|salary/i.test(lower)) type = 'INCOME';

  const walletHint = /bkash/i.test(lower) ? 'bKash' : /nagad/i.test(lower) ? 'Nagad' : 'Cash';

  res.json({
    source: 'BANGLISH_COMMAND',
    type,
    amount,
    fee: 0,
    walletHint,
    contactHint: contactMatch ? contactMatch[1].trim() : null,
    note: text,
  });
});

module.exports = router;
