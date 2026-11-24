const rateLimit = require('express-rate-limit');

const isTestEnv = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { success: false, message: 'Too many authentication attempts. Try again in 15 minutes.' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { success: false, message: 'Too many password reset attempts. Try again later.' },
});

const publicTrustLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { success: false, message: 'Too many public ledger requests.' },
});

function csrfOriginGuard(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();

  const origin = req.headers.origin;
  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (origin) {
    if (origin !== allowedOrigin) {
      return res.status(403).json({ success: false, message: 'Blocked by CSRF origin policy.' });
    }
    if (req.headers['x-requested-with'] !== 'HisabPro-Client') {
      return res.status(403).json({ success: false, message: 'Missing required security header.' });
    }
  }
  return next();
}

function getClientMeta(req) {
  const ip =
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const ua = String(req.headers['user-agent'] || '').slice(0, 200) || 'unknown';
  return { ipAddress: ip, userAgent: ua };
}

module.exports = {
  apiLimiter,
  authLimiter,
  resetLimiter,
  publicTrustLimiter,
  csrfOriginGuard,
  getClientMeta,
};
