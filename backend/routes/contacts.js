const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Sob contact + mot Pabo/Debo summary
router.get('/', async (req, res) => {
  const contacts = await req.prisma.contact.findMany({ orderBy: { createdAt: 'desc' } });
  let totalPabo = 0;
  let totalDebo = 0;
  for (const c of contacts) {
    if (c.netBalancePaisa > 0) totalPabo += c.netBalancePaisa;
    if (c.netBalancePaisa < 0) totalDebo += Math.abs(c.netBalancePaisa);
  }
  res.json({ contacts, summary: { totalPaboTaka: totalPabo / 100, totalDeboTaka: totalDebo / 100 } });
});

// Notun Contact profile add kora (auto Live Trust Link token soho)
router.post('/', async (req, res) => {
  try {
    const { name, phone, type = 'CUSTOMER', openingBalance = 0 } = req.body;
    const netBalancePaisa = Math.round(Number(openingBalance) * 100);
    const shareToken = crypto.randomBytes(6).toString('hex');

    const contact = await req.prisma.contact.create({
      data: {
        name,
        phone: phone || null,
        type,
        netBalancePaisa,
        shareToken,
      },
    });
    res.status(201).json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Public Live Trust Link (Login chara contact tar hisab dekhbe)
router.get('/trust/:token', async (req, res) => {
  const contact = await req.prisma.contact.findUnique({
    where: { shareToken: req.params.token },
    include: { transactions: { orderBy: { createdAt: 'desc' } } },
  });
  if (!contact) return res.status(404).json({ error: 'Invalid trust link' });
  res.json({
    name: contact.name,
    netBalanceTaka: contact.netBalancePaisa / 100,
    status: contact.netBalancePaisa > 0 ? 'You owe' : contact.netBalancePaisa < 0 ? 'You will receive' : 'Settled',
    transactions: contact.transactions,
  });
});

module.exports = router;
