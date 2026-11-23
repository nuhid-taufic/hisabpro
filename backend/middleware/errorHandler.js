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
  if (err instanceof ZodError) {
    const first = err.errors[0];
    return res.status(400).json({
      success: false,
      message: `${first.path.join('.') || 'Input'}: ${first.message}`,
    });
  }
  if (err?.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'value';
    return res.status(409).json({ success: false, message: `Duplicate entry for ${target}.` });
  }
  console.error('[API Error]', err);
  return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
}

module.exports = { AppError, asyncHandler, errorHandler };
