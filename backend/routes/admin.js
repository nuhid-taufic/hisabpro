const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { serialize } = require('../utils/money');
const {
  normalizeAndValidateEmail,
  normalizeAndValidatePhone,
} = require('../utils/validators');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
  plan: z.enum(['FREE', 'PRO', 'BUSINESS']).optional(),
  crmStage: z.enum(['LEAD', 'ONBOARDING', 'ACTIVE_USER', 'VIP', 'CHURNED']).optional(),
  preferredLanguage: z.enum(['en', 'bn']).optional(),
  crmNotes: z.string().max(1000).nullable().optional(),
});

const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  plan: z.enum(['FREE', 'PRO', 'BUSINESS']).default('FREE'),
  crmStage: z.enum(['LEAD', 'ONBOARDING', 'ACTIVE_USER', 'VIP', 'CHURNED']).default('ONBOARDING'),
  preferredLanguage: z.enum(['en', 'bn']).default('en'),
  crmNotes: z.string().max(500).optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const reviewResetSchema = z.object({
  adminNote: z.string().trim().max(250).optional(),
});

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(3).max(600),
  type: z.enum(['INFO', 'WARNING', 'PROMO', 'MAINTENANCE']).default('INFO'),
  targetPlan: z.enum(['ALL', 'FREE', 'PRO', 'BUSINESS']).default('ALL'),
  expiresInHours: z.coerce.number().min(0).max(720).optional(),
});

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      googleUsers,
      paidUsers,
      totalTransactions,
      totalStoreOrders,
      pendingResetCount,
      activeAnnouncementsCount,
      recentLogs,
    ] = await Promise.all([
      req.prisma.user.count(),
      req.prisma.user.count({ where: { status: 'ACTIVE' } }),
      req.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      req.prisma.user.count({ where: { status: 'BANNED' } }),
      req.prisma.user.count({ where: { authProvider: { in: ['GOOGLE', 'BOTH'] } } }),
      req.prisma.user.count({ where: { plan: { in: ['PRO', 'BUSINESS'] } } }),
      req.prisma.transaction.count({ where: { deletedAt: null } }),
      req.prisma.stockOrder.count({ where: { deletedAt: null } }),
      req.prisma.passwordResetRequest.count({ where: { status: 'PENDING' } }),
      req.prisma.announcement.count({ where: { isActive: true } }),
      req.prisma.adminAuditLog.findMany({
        include: { admin: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    res.json(
      serialize({
        success: true,
        stats: {
          totalUsers,
          activeUsers,
          suspendedUsers,
          bannedUsers,
          googleUsers,
          paidUsers,
          totalTransactions,
          totalStoreOrders,
          pendingResetCount,
          activeAnnouncementsCount,
        },
        recentLogs,
      })
    );
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { search, status, plan, role, crmStage } = req.query;
    const where = {};

    if (status && status !== 'ALL') where.status = status;
    if (plan && plan !== 'ALL') where.plan = plan;
    if (role && role !== 'ALL') where.role = role;
    if (crmStage && crmStage !== 'ALL') where.crmStage = crmStage;
    if (search && String(search).trim()) {
      const q = String(search).trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { crmNotes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const users = await req.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        authProvider: true,
        role: true,
        status: true,
        plan: true,
        crmStage: true,
        preferredLanguage: true,
        crmNotes: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            books: true,
            wallets: true,
            contacts: true,
            transactions: true,
            products: true,
            stockOrders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(serialize({ success: true, users }));
  })
);

router.get(
  '/users/export',
  asyncHandler(async (req, res) => {
    const users = await req.prisma.user.findMany({
      select: {
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        plan: true,
        crmStage: true,
        preferredLanguage: true,
        authProvider: true,
        lastLoginAt: true,
        createdAt: true,
        crmNotes: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'Name',
      'Email',
      'Phone',
      'Role',
      'Status',
      'Plan',
      'CRM Stage',
      'Language',
      'Provider',
      'Last Login',
      'Created At',
      'Notes',
    ];
    const rows = users.map((u) =>
      [
        u.name,
        u.email || '',
        u.phone || '',
        u.role,
        u.status,
        u.plan,
        u.crmStage,
        u.preferredLanguage,
        u.authProvider,
        u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : '',
        u.createdAt.toISOString().slice(0, 10),
        u.crmNotes || '',
      ]
        .map(esc)
        .join(',')
    );

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hisabpro-crm-users-${today}.csv"`);
    res.send([header.join(','), ...rows].join('\n'));
  })
);

router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = await req.prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        authProvider: true,
        role: true,
        status: true,
        plan: true,
        crmStage: true,
        preferredLanguage: true,
        crmNotes: true,
        tokenVersion: true,
        lastLoginAt: true,
        createdAt: true,
        wallets: { select: { id: true, name: true, type: true, balancePaisa: true } },
        books: { select: { id: true, name: true, bookType: true } },
        _count: {
          select: { contacts: true, transactions: true, products: true, stockOrders: true },
        },
      },
    });
    if (!user) throw new AppError('User not found.', 404);

    const recentTransactions = await req.prisma.transaction.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, type: true, amountPaisa: true, note: true, transactionDate: true },
      orderBy: { transactionDate: 'desc' },
      take: 8,
    });

    res.json(serialize({ success: true, user, recentTransactions }));
  })
);

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const body = adminCreateUserSchema.parse(req.body);
    let email = null;
    let phone = null;
    try {
      email = normalizeAndValidateEmail(body.email);
      phone = normalizeAndValidatePhone(body.phone);
    } catch (err) {
      throw new AppError(err.message, 400);
    }
    if (!email && !phone) {
      throw new AppError('Provide at least a valid email or valid phone number.', 400);
    }

    if (email && (await req.prisma.user.findUnique({ where: { email } }))) {
      throw new AppError('Email already exists.', 409);
    }
    if (phone && (await req.prisma.user.findUnique({ where: { phone } }))) {
      throw new AppError('Phone number already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const created = await req.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: body.name,
          email,
          phone,
          passwordHash,
          authProvider: email ? 'LOCAL' : 'PHONE',
          role: body.role,
          plan: body.plan,
          crmStage: body.crmStage,
          preferredLanguage: body.preferredLanguage,
          crmNotes: body.crmNotes || null,
        },
      });
      await tx.ledgerBook.createMany({
        data: [
          { userId: u.id, name: 'Personal', bookType: 'PERSONAL', isDefault: true },
          { userId: u.id, name: 'My Store', bookType: 'STORE', isDefault: false },
        ],
      });
      await tx.wallet.createMany({
        data: [
          { userId: u.id, name: 'Cash', type: 'CASH' },
          { userId: u.id, name: 'bKash', type: 'MFS' },
          { userId: u.id, name: 'Shop Cash Box', type: 'CASH' },
        ],
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: u.id,
          targetEmail: u.email || u.phone,
          action: 'CREATE_USER',
          details: `Created user role=${body.role}, plan=${body.plan}`,
        },
      });
      return u;
    });

    res.status(201).json(serialize({ success: true, user: created }));
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    const target = await req.prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('User not found.', 404);

    if (target.id === req.user.userId) {
      if (body.status && body.status !== 'ACTIVE') {
        throw new AppError('You cannot suspend or ban your own admin account.', 400);
      }
      if (body.role && body.role === 'USER') {
        throw new AppError('You cannot demote your own admin role.', 400);
      }
    }

    if (body.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new AppError('Only a SUPER_ADMIN can assign SUPER_ADMIN role.', 403);
    }

    const shouldRevokeSession = body.status && body.status !== 'ACTIVE';

    const updated = await req.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: target.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.plan !== undefined ? { plan: body.plan } : {}),
          ...(body.crmStage !== undefined ? { crmStage: body.crmStage } : {}),
          ...(body.preferredLanguage !== undefined ? { preferredLanguage: body.preferredLanguage } : {}),
          ...(body.crmNotes !== undefined ? { crmNotes: body.crmNotes } : {}),
          ...(shouldRevokeSession ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          plan: true,
          crmStage: true,
          preferredLanguage: true,
          crmNotes: true,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: target.id,
          targetEmail: target.email || target.phone,
          action: 'UPDATE_USER',
          details: JSON.stringify(body),
        },
      });

      return u;
    });

    res.json(serialize({ success: true, user: updated }));
  })
);

router.post(
  '/users/:id/impersonate',
  asyncHandler(async (req, res) => {
    const target = await req.prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
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
      },
    });
    if (!target) throw new AppError('Target user not found.', 404);
    if (target.id === req.user.userId) {
      throw new AppError('You are already logged into your own account.', 400);
    }
    if (target.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new AppError('Cannot impersonate a SUPER_ADMIN.', 403);
    }

    const admin = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, tokenVersion: true },
    });

    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 4 * 60 * 60 * 1000,
      path: '/',
    };

    const returnToken = jwt.sign(
      { userId: admin.id, email: admin.email, tv: admin.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    const impToken = jwt.sign(
      {
        userId: target.id,
        email: target.email,
        tv: target.tokenVersion,
        impersonatedBy: admin.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    await req.prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        targetUserId: target.id,
        targetEmail: target.email || target.phone,
        action: 'IMPERSONATE_USER',
        details: `Admin ${admin.email} logged in as ${target.name}`,
      },
    });

    res.cookie('hp_admin_return_token', returnToken, cookieOpts);
    res.cookie('hp_token', impToken, cookieOpts);

    const { tokenVersion, ...safeTarget } = target;
    res.json({
      success: true,
      user: safeTarget,
      impersonation: {
        active: true,
        adminId: admin.id,
        adminName: admin.name,
        adminEmail: admin.email,
      },
    });
  })
);

router.post(
  '/users/:id/force-logout',
  asyncHandler(async (req, res) => {
    const target = await req.prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('User not found.', 404);

    await req.prisma.$transaction([
      req.prisma.user.update({
        where: { id: target.id },
        data: { tokenVersion: { increment: 1 } },
      }),
      req.prisma.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: target.id,
          targetEmail: target.email || target.phone,
          action: 'FORCE_LOGOUT',
          details: 'Invalidated all active sessions',
        },
      }),
    ]);

    res.json({ success: true, message: `All active sessions revoked for ${target.name}.` });
  })
);

router.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const { newPassword } = resetPasswordSchema.parse(req.body);
    const target = await req.prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('User not found.', 404);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await req.prisma.$transaction([
      req.prisma.user.update({
        where: { id: target.id },
        data: {
          passwordHash,
          authProvider: target.googleId ? 'BOTH' : target.authProvider,
          tokenVersion: { increment: 1 },
        },
      }),
      req.prisma.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: target.id,
          targetEmail: target.email || target.phone,
          action: 'RESET_PASSWORD',
          details: 'Admin manually reset password',
        },
      }),
    ]);

    res.json({ success: true, message: `Password reset for ${target.name}.` });
  })
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const target = await req.prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('User not found.', 404);
    if (target.id === req.user.userId) {
      throw new AppError('You cannot delete your own admin account.', 400);
    }
    if (target.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new AppError('Cannot delete a SUPER_ADMIN account.', 403);
    }

    await req.prisma.$transaction([
      req.prisma.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: target.id,
          targetEmail: target.email || target.phone,
          action: 'DELETE_USER',
          details: `Permanently removed user ${target.name}`,
        },
      }),
      req.prisma.user.delete({ where: { id: target.id } }),
    ]);

    res.json({ success: true, message: `User ${target.name} deleted permanently.` });
  })
);

router.get(
  '/reset-requests',
  asyncHandler(async (req, res) => {
    const requests = await req.prisma.passwordResetRequest.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, status: true } },
        approvedBy: { select: { name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
    res.json(serialize({ success: true, requests }));
  })
);

router.post(
  '/reset-requests/:id/approve',
  asyncHandler(async (req, res) => {
    const body = reviewResetSchema.parse(req.body || {});
    const existing = await req.prisma.passwordResetRequest.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    if (!existing) throw new AppError('Reset request not found.', 404);
    if (existing.status !== 'PENDING') {
      throw new AppError(`Request is already ${existing.status}.`, 400);
    }

    const approvalCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const updated = await req.prisma.$transaction(async (tx) => {
      const r = await tx.passwordResetRequest.update({
        where: { id: existing.id },
        data: {
          status: 'APPROVED',
          approvalCode,
          adminNote: body.adminNote || 'Approved by Admin (Valid 24 hours)',
          approvedById: req.user.userId,
          expiresAt,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: existing.userId,
          targetEmail: existing.user.email || existing.user.phone,
          action: 'APPROVE_PASSWORD_RESET',
          details: `Approved password reset request (${approvalCode})`,
        },
      });
      return r;
    });

    res.json(serialize({ success: true, request: updated }));
  })
);

router.post(
  '/reset-requests/:id/reject',
  asyncHandler(async (req, res) => {
    const body = reviewResetSchema.parse(req.body || {});
    const existing = await req.prisma.passwordResetRequest.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!existing) throw new AppError('Reset request not found.', 404);
    if (existing.status !== 'PENDING') {
      throw new AppError(`Request is already ${existing.status}.`, 400);
    }

    const updated = await req.prisma.$transaction(async (tx) => {
      const r = await tx.passwordResetRequest.update({
        where: { id: existing.id },
        data: {
          status: 'REJECTED',
          adminNote: body.adminNote || 'Rejected by Admin',
          approvedById: req.user.userId,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: existing.userId,
          targetEmail: existing.user.email || existing.user.phone,
          action: 'REJECT_PASSWORD_RESET',
          details: body.adminNote || 'Rejected password reset request',
        },
      });
      return r;
    });

    res.json(serialize({ success: true, request: updated }));
  })
);

router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const announcements = await req.prisma.announcement.findMany({
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(serialize({ success: true, announcements }));
  })
);

router.post(
  '/announcements',
  asyncHandler(async (req, res) => {
    const body = createAnnouncementSchema.parse(req.body);
    const expiresAt =
      body.expiresInHours && body.expiresInHours > 0
        ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
        : null;

    const announcement = await req.prisma.$transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          title: body.title,
          message: body.message,
          type: body.type,
          targetPlan: body.targetPlan,
          expiresAt,
          createdById: req.user.userId,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          action: 'CREATE_ANNOUNCEMENT',
          details: `[${body.type}] ${body.title} (Target: ${body.targetPlan})`,
        },
      });
      return created;
    });

    res.status(201).json(serialize({ success: true, announcement }));
  })
);

router.patch(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    const existing = await req.prisma.announcement.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Announcement not found.', 404);

    const updated = await req.prisma.announcement.update({
      where: { id: existing.id },
      data: {
        isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : !existing.isActive,
      },
    });
    res.json(serialize({ success: true, announcement: updated }));
  })
);

router.delete(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    const existing = await req.prisma.announcement.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Announcement not found.', 404);

    await req.prisma.$transaction([
      req.prisma.announcement.delete({ where: { id: existing.id } }),
      req.prisma.adminAuditLog.create({
        data: {
          adminId: req.user.userId,
          action: 'DELETE_ANNOUNCEMENT',
          details: `Deleted announcement: ${existing.title}`,
        },
      }),
    ]);

    res.json({ success: true });
  })
);

module.exports = router;
