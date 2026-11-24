function getAllowedOrigin() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function getCookieOptions(maxAgeMs = 24 * 60 * 60 * 1000) {
  const isCrossSite = process.env.CROSS_SITE_COOKIES === 'true';
  const originIsHttps = getAllowedOrigin().startsWith('https://');
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : isCrossSite || originIsHttps;

  return {
    httpOnly: true,
    sameSite: isCrossSite ? 'none' : 'lax',
    secure,
    maxAge: maxAgeMs,
    path: '/',
  };
}

module.exports = { getAllowedOrigin, getCookieOptions };
