const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { serialize, toPaisa } = require('../utils/money');

const router = express.Router();
router.use(requireAuth);

const createContactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(80),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH', 'FRIEND', 'CLIENT', 'FAMILY', 'OTHER']).default('CUSTOMER'),
  address: z.string().trim().max(150).optional(),
  note: z.string().trim().max(250).optional(),
  openingBalance: z.coerce.number().default(0),
  enableTrustLink: z.boolean().default(true),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const filter = req.query.filter || 'all';
    const search = req.query.search ? String(req.query.search).trim() : '';

    const where = { userId };
    if (filter === 'pabo') where.netBalancePaisa = { gt: 0n };
    if (filter === 'debo') where.netBalancePaisa = { lt: 0n };
    if (filter === 'customer') where.type = { in: ['CUSTOMER', 'BOTH'] };
    if (filter === 'supplier') where.type = { in: ['SUPPLIER', 'BOTH'] };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const contacts = await req.prisma.contact.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
    });

    const summary = contacts.reduce(
      (acc, c) => {
        if (c.netBalancePaisa > 0n) acc.totalPaboPaisa += c.netBalancePaisa;
        if (c.netBalancePaisa < 0n) acc.totalDeboPaisa += -c.netBalancePaisa;
        return acc;
      },
      { totalPaboPaisa: 0n, totalDeboPaisa: 0n }
    );

    res.json(serialize({ success: true, contacts, summary }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = createContactSchema.parse(req.body);
    const normalizedPhone = body.phone ? body.phone.replace(/\s+/g, '') : null;

    if (normalizedPhone) {
      const existing = await req.prisma.contact.findFirst({ where: { userId, phone: normalizedPhone } });
      if (existing) {
        throw new AppError(`Phone ${normalizedPhone} already belongs to ${existing.name}.`, 409);
      }
    }

    const openingPaisa = toPaisa(body.openingBalance);
    const shareToken = body.enableTrustLink ? crypto.randomBytes(8).toString('hex') : null;

    const contact = await req.prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: {
          userId,
          name: body.name,
          phone: normalizedPhone,
          type: body.type,
          address: body.address || null,
          note: body.note || null,
          netBalancePaisa: openingPaisa,
          isShareEnabled: body.enableTrustLink,
          shareToken,
        },
      });

      if (openingPaisa !== 0n) {
        const defaultBook = await tx.ledgerBook.findFirst({
          where: { userId },
          orderBy: { isDefault: 'desc' },
        });
        if (defaultBook) {
          await tx.transaction.create({
            data: {
              userId,
              bookId: defaultBook.id,
              contactId: created.id,
              type: openingPaisa > 0n ? 'LEND' : 'CREDIT_EXPENSE',
              amountPaisa: openingPaisa > 0n ? openingPaisa : -openingPaisa,
              note: 'Opening balance carried forward from previous khata',
            },
          });
        }
      }

      return created;
    });

    res.status(201).json(serialize({ success: true, contact }));
  })
);

router.get(
  '/:id/ledger',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const contact = await req.prisma.contact.findFirst({ where: { id: req.params.id, userId } });
    if (!contact) throw new AppError('Contact not found.', 404);

    const transactions = await req.prisma.transaction.findMany({
      where: { userId, contactId: contact.id, deletedAt: null },
      include: {
        wallet: { select: { id: true, name: true, type: true } },
        stockOrder: {
          include: {
            items: { include: { product: { select: { name: true, unit: true } } } },
          },
        },
      },
      orderBy: { transactionDate: 'desc' },
    });

    res.json(serialize({ success: true, contact, transactions }));
  })
);

router.post(
  '/:id/share-link',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const existing = await req.prisma.contact.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new AppError('Contact not found.', 404);

    const rotate = req.body?.rotate === true;
    const token = !rotate && existing.shareToken ? existing.shareToken : crypto.randomBytes(8).toString('hex');

    const contact = await req.prisma.contact.update({
      where: { id: existing.id },
      data: { shareToken: token, isShareEnabled: true },
    });

    res.json(serialize({ success: true, shareToken: contact.shareToken, contact }));
  })
);

router.delete(
  '/:id/share-link',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const existing = await req.prisma.contact.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new AppError('Contact not found.', 404);

    const contact = await req.prisma.contact.update({
      where: { id: existing.id },
      data: { isShareEnabled: false, shareToken: null },
    });

    res.json(serialize({ success: true, contact }));
  })
);

module.exports = router;
