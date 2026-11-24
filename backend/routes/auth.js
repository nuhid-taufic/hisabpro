const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const {
  normalizeAndValidateEmail,
  normalizeAndValidatePhone,
  parseLoginIdentifier,
} = require('../utils/validators');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  preferredLanguage: z.enum(['en', 'bn']).default('en'),
});

const loginSchema = z.object({
  identifier: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  password: z.string().min(1, 'Password is required'),
});

const googleSchema = z.object({
  credential: z.string().min(20, 'Valid Google credential token required'),
});

const preferencesSchema = z.object({
  preferredLanguage: z.enum(['en', 'bn']).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  baseCurrency: z.enum(['BDT', 'USD']).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const resetRequestSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your registered email or phone number'),
  reason: z.string().trim().max(250).optional(),
});

const resetStatusSchema = z.object({
  identifier: z.string().trim().min(3),
});

const resetCompleteSchema = z.object({
  identifier: z.string().trim().min(3),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  authProvider: true,
  role: true,
  status: true,
  plan: true,
  baseCurrency: true,
  preferredLanguage: true,
  tokenVersion: true,
  passwordHash: true,
};

function sanitizeUser(u) {
  const { tokenVersion, passwordHash, ...safe } = u;
  return { ...safe, hasPassword: Boolean(passwordHash) };
}

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function issueSessionCookie(res, user, extraClaims = {}) {
  const token = jwt.sign(
    { userId: user.id, email: user.email, tv: user.tokenVersion ?? 0, ...extraClaims },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('hp_token', token, getCookieOptions());
  return token;
}

async function seedStarterWorkspace(tx, userId) {
  await tx.ledgerBook.createMany({
    data: [
      { userId, name: 'Personal', bookType: 'PERSONAL', isDefault: true },
      { userId, name: 'My Store', bookType: 'STORE', isDefault: false },
    ],
  });
  await tx.wallet.createMany({
    data: [
      { userId, name: 'Cash', type: 'CASH' },
      { userId, name: 'bKash', type: 'MFS' },
      { userId, name: 'Shop Cash Box', type: 'CASH' },
    ],
  });
  await tx.category.createMany({
    data: [
      { userId, name: 'Food', isIncome: false },
      { userId, name: 'Transport', isIncome: false },
      { userId, name: 'Bills & Utilities', isIncome: false },
      { userId, name: 'Shop Expense', isIncome: false },
      { userId, name: 'Freelance', isIncome: true },
      { userId, name: 'Store Sales', isIncome: true },
    ],
  });
}

async function findUserByIdentifier(prisma, rawIdentifier) {
  let parsed;
  try {
    parsed = parseLoginIdentifier(rawIdentifier);
  } catch (err) {
    throw new AppError(err.message, 400);
  }

  const user = await prisma.user.findUnique({
    where: parsed.kind === 'email' ? { email: parsed.value } : { phone: parsed.value },
  });
  return { parsed, user };
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    let email = null;
    let phone = null;
    try {
      email = normalizeAndValidateEmail(body.email);
      phone = normalizeAndValidatePhone(body.phone);
    } catch (err) {
      throw new AppError(err.message, 400);
    }

    if (!email && !phone) {
      throw new AppError('Provide at least a valid email address or a valid phone number.', 400);
    }

    if (email && (await req.prisma.user.findUnique({ where: { email } }))) {
      throw new AppError('An account with this email already exists.', 409);
    }
    if (phone && (await req.prisma.user.findUnique({ where: { phone } }))) {
      throw new AppError('An account with this phone number already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await req.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: body.name,
          email,
          phone,
          passwordHash,
          authProvider: email ? 'LOCAL' : 'PHONE',
          preferredLanguage: body.preferredLanguage,
          lastLoginAt: new Date(),
        },
        select: USER_PUBLIC_SELECT,
      });
      await seedStarterWorkspace(tx, created.id);
      return created;
    });

    res.clearCookie('hp_admin_return_token', { path: '/' });
    issueSessionCookie(res, user);
    res.status(201).json({ success: true, user: sanitizeUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const rawId = body.identifier || body.email || body.phone || '';
    const { user } = await findUserByIdentifier(req.prisma, rawId);

    if (!user) throw new AppError('Invalid email/phone or password.', 401);
    if (user.status !== 'ACTIVE') {
      throw new AppError(`Your account is ${user.status.toLowerCase()}. Contact administrator.`, 403);
    }
    if (!user.passwordHash) {
      throw new AppError('This account uses Google Sign-In. Please continue with Google.', 400);
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) throw new AppError('Invalid email/phone or password.', 401);

    const updated = await req.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: USER_PUBLIC_SELECT,
    });

    res.clearCookie('hp_admin_return_token', { path: '/' });
    issueSessionCookie(res, updated);
    res.json({ success: true, user: sanitizeUser(updated) });
  })
);

router.post(
  '/google',
  asyncHandler(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new AppError('GOOGLE_CLIENT_ID is not configured on the backend server.', 503);
    }

    const { credential } = googleSchema.parse(req.body);
    const oauthClient = new OAuth2Client(clientId);

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError('Google token verification failed. Please try again.', 401);
    }

    if (!payload?.email || !payload.email_verified) {
      throw new AppError('Verified Google email is required.', 400);
    }

    const email = normalizeAndValidateEmail(payload.email);
    const googleId = payload.sub;
    const name = payload.name || email.split('@')[0];
    const avatarUrl = payload.picture || null;

    let user = await req.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      if (user.status !== 'ACTIVE') {
        throw new AppError(`Your account is ${user.status.toLowerCase()}. Contact administrator.`, 403);
      }
      user = await req.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          avatarUrl: avatarUrl || user.avatarUrl,
          authProvider: user.passwordHash ? 'BOTH' : 'GOOGLE',
          lastLoginAt: new Date(),
        },
        select: USER_PUBLIC_SELECT,
      });
    } else {
      user = await req.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name,
            email,
            googleId,
            avatarUrl,
            authProvider: 'GOOGLE',
            lastLoginAt: new Date(),
          },
          select: USER_PUBLIC_SELECT,
        });
        await seedStarterWorkspace(tx, created.id);
        return created;
      });
    }

    res.clearCookie('hp_admin_return_token', { path: '/' });
    issueSessionCookie(res, user);
    res.json({ success: true, user: sanitizeUser(user) });
  })
);

router.post('/logout', (_req, res) => {
  res.clearCookie('hp_token', { path: '/' });
  res.clearCookie('hp_admin_return_token', { path: '/' });
  res.json({ success: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new AppError('User not found.', 404);
    res.json({
      success: true,
      user: sanitizeUser(user),
      impersonation: req.impersonation || null,
    });
  })
);

router.patch(
  '/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = preferencesSchema.parse(req.body);
    const updated = await req.prisma.user.update({
      where: { id: req.user.userId },
      data: {
        ...(body.preferredLanguage !== undefined ? { preferredLanguage: body.preferredLanguage } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.baseCurrency !== undefined ? { baseCurrency: body.baseCurrency } : {}),
      },
      select: USER_PUBLIC_SELECT,
    });
    res.json({ success: true, user: sanitizeUser(updated) });
  })
);

router.post(
  '/stop-impersonation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const returnToken = req.cookies?.hp_admin_return_token;
    if (!returnToken || !req.impersonation?.active) {
      throw new AppError('Not currently impersonating a user.', 400);
    }

    let decoded;
    try {
      decoded = jwt.verify(returnToken, process.env.JWT_SECRET);
    } catch {
      throw new AppError('Admin restore session expired. Please sign in again.', 401);
    }

    const admin = await req.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: USER_PUBLIC_SELECT,
    });
    if (!admin || admin.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(admin.role)) {
      throw new AppError('Admin account is no longer valid.', 403);
    }

    await req.prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        targetUserId: req.user.userId,
        targetEmail: req.user.email || req.user.phone || 'unknown',
        action: 'STOP_IMPERSONATION',
        details: 'Returned to dedicated CRM session',
      },
    });

    res.clearCookie('hp_admin_return_token', { path: '/' });
    issueSessionCookie(res, admin);
    res.json({ success: true, user: sanitizeUser(admin) });
  })
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new AppError('User not found.', 404);

    if (user.passwordHash) {
      if (!body.currentPassword) {
        throw new AppError('Current password is required.', 400);
      }
      const match = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!match) {
        throw new AppError('Current password is incorrect.', 400);
      }
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    const updated = await req.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        authProvider: user.googleId ? 'BOTH' : user.authProvider,
        tokenVersion: { increment: 1 },
      },
      select: USER_PUBLIC_SELECT,
    });

    if (!req.impersonation?.active) {
      issueSessionCookie(res, updated);
    }
    res.json({ success: true, message: 'Password updated successfully.' });
  })
);

router.post(
  '/password-reset/request',
  asyncHandler(async (req, res) => {
    const body = resetRequestSchema.parse(req.body);
    const { parsed, user } = await findUserByIdentifier(req.prisma, body.identifier);

    if (!user) throw new AppError('No account found with this email or phone number.', 404);
    if (user.status !== 'ACTIVE') {
      throw new AppError(`Account is ${user.status.toLowerCase()}. Contact administrator.`, 403);
    }

    const existing = await req.prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: { in: ['PENDING', 'APPROVED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      if (existing.status === 'APPROVED' && existing.expiresAt && existing.expiresAt < new Date()) {
        await req.prisma.passwordResetRequest.update({
          where: { id: existing.id },
          data: { status: 'REJECTED', adminNote: 'Approval expired (24h limit)' },
        });
      } else {
        return res.json({
          success: true,
          request: {
            id: existing.id,
            status: existing.status,
            adminNote: existing.adminNote,
            expiresAt: existing.expiresAt,
            createdAt: existing.createdAt,
          },
          message:
            existing.status === 'APPROVED'
              ? 'Your reset request is already APPROVED! You can set a new password now.'
              : 'A reset request is already pending Admin approval.',
        });
      }
    }

    const created = await req.prisma.passwordResetRequest.create({
      data: {
        userId: user.id,
        identifier: parsed.value,
        reason: body.reason || 'Requested password reset',
        status: 'PENDING',
      },
    });

    res.status(201).json({
      success: true,
      request: { id: created.id, status: created.status, createdAt: created.createdAt },
      message: 'Password reset request sent to Admin. Once approved, you can set a new password.',
    });
  })
);

router.post(
  '/password-reset/status',
  asyncHandler(async (req, res) => {
    const body = resetStatusSchema.parse(req.body);
    const { user } = await findUserByIdentifier(req.prisma, body.identifier);
    if (!user) throw new AppError('No account found with this email or phone number.', 404);

    const latest = await req.prisma.passwordResetRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) return res.json({ success: true, request: null });

    let status = latest.status;
    if (status === 'APPROVED' && latest.expiresAt && latest.expiresAt < new Date()) {
      status = 'EXPIRED';
    }

    res.json({
      success: true,
      request: {
        id: latest.id,
        status,
        reason: latest.reason,
        adminNote: latest.adminNote,
        expiresAt: latest.expiresAt,
        createdAt: latest.createdAt,
      },
    });
  })
);

router.post(
  '/password-reset/complete',
  asyncHandler(async (req, res) => {
    const body = resetCompleteSchema.parse(req.body);
    const { user } = await findUserByIdentifier(req.prisma, body.identifier);
    if (!user) throw new AppError('Account not found.', 404);

    const approvedReq = await req.prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: 'APPROVED' },
      orderBy: { updatedAt: 'desc' },
    });

    if (!approvedReq) {
      throw new AppError('Password reset has not been approved by Admin yet.', 403);
    }

    if (approvedReq.expiresAt && approvedReq.expiresAt < new Date()) {
      await req.prisma.passwordResetRequest.update({
        where: { id: approvedReq.id },
        data: { status: 'REJECTED', adminNote: 'Approval window expired' },
      });
      throw new AppError('Approval expired. Please submit a new reset request.', 400);
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);

    await req.prisma.$transaction([
      req.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          authProvider: user.googleId ? 'BOTH' : user.authProvider,
          tokenVersion: { increment: 1 },
        },
      }),
      req.prisma.passwordResetRequest.update({
        where: { id: approvedReq.id },
        data: { status: 'COMPLETED' },
      }),
    ]);

    res.json({
      success: true,
      message: 'Password reset successful! You can now sign in with your new password.',
    });
  })
);

module.exports = router;
