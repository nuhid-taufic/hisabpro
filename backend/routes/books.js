const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

const createBookSchema = z.object({
  name: z.string().trim().min(2).max(50),
  bookType: z.enum(['PERSONAL', 'STORE']).default('PERSONAL'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const books = await req.prisma.ledgerBook.findMany({
      where: { userId: req.user.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, books });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createBookSchema.parse(req.body);
    const book = await req.prisma.ledgerBook.create({
      data: { userId: req.user.userId, name: body.name, bookType: body.bookType },
    });
    res.status(201).json({ success: true, book });
  })
);

module.exports = router;
