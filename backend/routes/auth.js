const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Valid email required').toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

function issueSessionCookie(res, user) {
  const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
  res.cookie('hp_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const exists = await req.prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new AppError('An account with this email already exists.', 409);

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await req.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: body.name, email: body.email, passwordHash },
        select: { id: true, name: true, email: true, baseCurrency: true },
      });
      await tx.ledgerBook.createMany({
        data: [
          { userId: created.id, name: 'Personal', bookType: 'PERSONAL', isDefault: true },
          { userId: created.id, name: 'My Store', bookType: 'STORE', isDefault: false },
        ],
      });
      await tx.wallet.createMany({
        data: [
          { userId: created.id, name: 'Cash', type: 'CASH' },
          { userId: created.id, name: 'bKash', type: 'MFS' },
          { userId: created.id, name: 'Shop Cash Box', type: 'CASH' },
        ],
      });
      await tx.category.createMany({
        data: [
          { userId: created.id, name: 'Food', isIncome: false },
          { userId: created.id, name: 'Transport', isIncome: false },
          { userId: created.id, name: 'Bills & Utilities', isIncome: false },
          { userId: created.id, name: 'Shop Expense', isIncome: false },
          { userId: created.id, name: 'Freelance', isIncome: true },
          { userId: created.id, name: 'Store Sales', isIncome: true },
        ],
      });
      return created;
    });

    issueSessionCookie(res, user);
    res.status(201).json({ success: true, user });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await req.prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new AppError('Invalid email or password.', 401);
    }

    issueSessionCookie(res, user);
    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, baseCurrency: user.baseCurrency },
    });
  })
);

router.post('/logout', (_req, res) => {
  res.clearCookie('hp_token', { path: '/' });
  res.json({ success: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, baseCurrency: true },
    });
    if (!user) throw new AppError('User not found.', 404);
    res.json({ success: true, user });
  })
);

module.exports = router;
