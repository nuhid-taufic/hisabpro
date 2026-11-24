const { ZodError } = require('zod');

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  if (err instanceof ZodError || err?.name === 'ZodError') {
    const issues = err.issues || err.errors || [];
    const first = issues[0];
    const path = Array.isArray(first?.path) && first.path.length > 0 ? first.path.join('.') : 'Input';
    const message = first?.message || 'Invalid request input.';
    return res.status(400).json({
      success: false,
      message: `${path}: ${message}`,
    });
  }
  if (err?.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'value';
    return res.status(409).json({ success: false, message: `Duplicate entry for ${target}.` });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request payload is too large.' });
  }
  console.error('[API Error]', err);
  const safeMsg =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error';
  return res.status(500).json({ success: false, message: safeMsg });
}

module.exports = { AppError, asyncHandler, errorHandler };
