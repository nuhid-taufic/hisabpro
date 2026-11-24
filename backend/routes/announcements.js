const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/active',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const userPlan = req.user.plan || 'FREE';

    const announcements = await req.prisma.announcement.findMany({
      where: {
        isActive: true,
        targetPlan: { in: ['ALL', userPlan] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({ success: true, announcements });
  })
);

module.exports = router;
