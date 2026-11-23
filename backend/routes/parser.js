const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { serialize, toPaisa } = require('../utils/money');
const { parseMagicInput } = require('../utils/parserEngine');

const router = express.Router();
router.use(requireAuth);

const previewSchema = z.object({
  input: z.string().trim().min(2, 'Type a Banglish command or paste an SMS'),
});

router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { input } = previewSchema.parse(req.body);
    const parsed = parseMagicInput(input);

    let isDuplicateTrx = false;
    if (parsed.externalTrxId) {
      const existingTx = await req.prisma.transaction.findFirst({
        where: { userId, externalTrxId: parsed.externalTrxId, deletedAt: null },
      });
      isDuplicateTrx = Boolean(existingTx);
    }

    const [wallets, contacts, categories] = await Promise.all([
      req.prisma.wallet.findMany({ where: { userId, isArchived: false } }),
      req.prisma.contact.findMany({ where: { userId } }),
      req.prisma.category.findMany({ where: { userId } }),
    ]);

    const matchedWallet = parsed.walletHint
      ? wallets.find((w) => w.name.toLowerCase().includes(parsed.walletHint.toLowerCase())) || null
      : null;

    const matchedTargetWallet = parsed.targetWalletHint
      ? wallets.find((w) => w.name.toLowerCase().includes(parsed.targetWalletHint.toLowerCase())) || null
      : null;

    const matchedContact = parsed.contactHint
      ? contacts.find(
          (c) =>
            c.name.toLowerCase().includes(parsed.contactHint.toLowerCase()) ||
            (c.phone && c.phone.includes(parsed.contactHint))
        ) || null
      : null;

    const matchedCategory = parsed.categoryHint
      ? categories.find((c) => c.name.toLowerCase().includes(parsed.categoryHint.toLowerCase())) || null
      : null;

    let balanceMismatch = null;
    if (parsed.smsBalance !== null && matchedWallet) {
      const deltaPaisa =
        parsed.type === 'INCOME'
          ? toPaisa(parsed.amount) - toPaisa(parsed.fee)
          : -(toPaisa(parsed.amount) + toPaisa(parsed.fee));
      const projectedAppBalance = Number(matchedWallet.balancePaisa + deltaPaisa) / 100;
      const difference = Number((parsed.smsBalance - projectedAppBalance).toFixed(2));

      if (Math.abs(difference) >= 0.5) {
        balanceMismatch = {
          walletId: matchedWallet.id,
          walletName: matchedWallet.name,
          smsBalance: parsed.smsBalance,
          expectedAppBalanceAfterTx: projectedAppBalance,
          difference,
        };
      }
    }

    res.json(
      serialize({
        success: true,
        parsed,
        warnings: { isDuplicateTrx, balanceMismatch },
        resolved: {
          walletId: matchedWallet?.id || null,
          walletName: matchedWallet?.name || null,
          targetWalletId: matchedTargetWallet?.id || null,
          targetWalletName: matchedTargetWallet?.name || null,
          contactId: matchedContact?.id || null,
          contactName: matchedContact?.name || parsed.contactHint,
          isNewContact: Boolean(parsed.contactHint && !matchedContact),
          categoryId: matchedCategory?.id || null,
          categoryName: matchedCategory?.name || null,
        },
      })
    );
  })
);

module.exports = router;
