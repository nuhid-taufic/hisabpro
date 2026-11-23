const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  isIncome: z.boolean().default(false),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await req.prisma.category.findMany({
      where: { userId: req.user.userId },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, categories });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createCategorySchema.parse(req.body);
    const category = await req.prisma.category.create({
      data: { userId: req.user.userId, name: body.name, isIncome: body.isIncome },
    });
    res.status(201).json({ success: true, category });
  })
);

module.exports = router;
