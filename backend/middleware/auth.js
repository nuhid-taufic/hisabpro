const jwt = require('jsonwebtoken');

const JWT_VERIFY_OPTS = {
  algorithms: ['HS256'],
  issuer: 'hisabpro-api',
  audience: 'hisabpro-client',
};

async function requireAuth(req, res, next) {
  const cookieToken = req.cookies?.hp_token;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Please sign in to continue.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTS);
    const user = await req.prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        plan: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      res.clearCookie('hp_token', { path: '/' });
      return res.status(401).json({ success: false, message: 'Account no longer exists.' });
    }

    if (payload.impersonatedBy) {
      const admin = await req.prisma.user.findUnique({
        where: { id: payload.impersonatedBy },
        select: { id: true, name: true, email: true, role: true, status: true },
      });
      if (!admin || admin.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(admin.role)) {
        res.clearCookie('hp_token', { path: '/' });
        res.clearCookie('hp_admin_return_token', { path: '/' });
        return res.status(401).json({ success: false, message: 'Impersonation session expired.' });
      }
      req.impersonation = {
        active: true,
        adminId: admin.id,
        adminName: admin.name,
        adminEmail: admin.email,
      };
    } else {
      if (user.status !== 'ACTIVE') {
        res.clearCookie('hp_token', { path: '/' });
        return res.status(403).json({
          success: false,
          message: `Account is ${user.status.toLowerCase()}. Please contact support.`,
        });
      }

      if (typeof payload.tv === 'number' && payload.tv !== user.tokenVersion) {
        res.clearCookie('hp_token', { path: '/' });
        return res.status(401).json({
          success: false,
          message: 'Session was revoked. Please sign in again.',
        });
      }
    }

    req.user = {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      plan: user.plan,
    };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
  }
}

module.exports = { requireAuth, JWT_VERIFY_OPTS };
