function requireAdmin(req, res, next) {
  if (!req.user || !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Admin privileges required to access CRM controls.',
    });
  }
  return next();
}

module.exports = { requireAdmin };
