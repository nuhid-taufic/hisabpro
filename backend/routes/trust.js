const express = require('express');
const { z } = require('zod');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { serialize } = require('../utils/money');

const router = express.Router();

const verifySchema = z.object({
  status: z.enum(['CONFIRMED', 'DISPUTED']),
  disputeNote: z.string().trim().max(250).optional(),
});

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const contact = await req.prisma.contact.findFirst({
      where: { shareToken: req.params.token, isShareEnabled: true },
      include: { user: { select: { name: true, baseCurrency: true } } },
    });

    if (!contact) {
      throw new AppError('This ledger link is invalid or has been revoked.', 404);
    }

    const transactions = await req.prisma.transaction.findMany({
      where: { contactId: contact.id, deletedAt: null },
      select: {
        id: true,
        type: true,
        amountPaisa: true,
        note: true,
        externalTrxId: true,
        transactionDate: true,
        verificationStatus: true,
        verifiedAt: true,
        disputeNote: true,
        wallet: { select: { name: true } },
        stockOrder: {
          select: {
            orderNumber: true,
            totalAmountPaisa: true,
            paidAmountPaisa: true,
            dueAmountPaisa: true,
            items: {
              select: {
                quantity: true,
                mrpPricePaisa: true,
                unitPricePaisa: true,
                lineTotalPaisa: true,
                product: { select: { name: true, unit: true } },
              },
            },
          },
        },
      },
      orderBy: { transactionDate: 'desc' },
    });

    res.json(
      serialize({
        success: true,
        ownerName: contact.user.name,
        currency: contact.user.baseCurrency,
        contact: {
          name: contact.name,
          type: contact.type,
          netBalancePaisa: contact.netBalancePaisa,
        },
        transactions,
      })
    );
  })
);

router.post(
  '/:token/transactions/:txId/verify',
  asyncHandler(async (req, res) => {
    const body = verifySchema.parse(req.body);
    if (body.status === 'DISPUTED' && !body.disputeNote) {
      throw new AppError('Please explain briefly what looks wrong.', 400);
    }

    const contact = await req.prisma.contact.findFirst({
      where: { shareToken: req.params.token, isShareEnabled: true },
    });
    if (!contact) throw new AppError('Invalid or revoked trust link.', 404);

    const txRecord = await req.prisma.transaction.findFirst({
      where: { id: req.params.txId, contactId: contact.id, deletedAt: null },
    });
    if (!txRecord) throw new AppError('Transaction not found for this contact.', 404);

    const updated = await req.prisma.transaction.update({
      where: { id: txRecord.id },
      data: {
        verificationStatus: body.status,
        verifiedAt: new Date(),
        disputeNote: body.status === 'DISPUTED' ? body.disputeNote : null,
      },
    });

    res.json(serialize({ success: true, transaction: updated }));
  })
);

module.exports = router;
